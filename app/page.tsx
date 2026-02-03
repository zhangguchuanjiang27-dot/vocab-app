"use client";

import { useState, useEffect } from "react";
import { signOut, useSession, signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import Typewriter from 'typewriter-effect';
import CountUp from 'react-countup';

import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  defaultDropAnimationSideEffects,
  DragStartEvent,
  DragOverEvent,
  DragEndEvent,
  useDroppable,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// 型定義
type WordCard = {
  id?: string;
  word: string;
  partOfSpeech?: string; // 品詞
  meaning: string;
  example: string;
  example_jp: string;
  otherExamples?: { role: string; text: string; translation: string }[];
};

type Deck = {
  id: string;
  title: string;
  order: number;
  createdAt: string;
  words: WordCard[];
  folderId?: string | null;
};

type Folder = {
  id: string;
  name: string;
  createdAt: string;
  decks?: Deck[];
};

// --- Leveling Helpers ---
// Level L needs L*100 XP to reach L+1.
// Level 1: 0-99 XP
// Level 2: 100-299 XP
// Level 3: 300-599 XP
const getLevelInfo = (totalXp: number) => {
  let level = 1;
  let xpInCurrentLevel = totalXp;
  let xpRequiredForNext = 100;

  while (xpInCurrentLevel >= xpRequiredForNext) {
    xpInCurrentLevel -= xpRequiredForNext;
    level++;
    xpRequiredForNext = level * 100;
  }

  return { level, xpInCurrentLevel, xpRequiredForNext, progress: (xpInCurrentLevel / xpRequiredForNext) * 100 };
};

export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const isLoadingSession = status === "loading";

  // 生成・編集用ステート
  const [wordInput, setWordInput] = useState("");
  const [words, setWords] = useState<WordCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // 保存・一覧用ステート
  const [deckTitle, setDeckTitle] = useState("");
  // 既存のデッキに追加するためのステート (既に定義済み)
  const [showAddToDeckModal, setShowAddToDeckModal] = useState(false);
  const [savedDecks, setSavedDecks] = useState<Deck[]>([]);
  const [showSaved, setShowSaved] = useState(false);

  // フォルダ用ステート
  const [folders, setFolders] = useState<Folder[]>([]);
  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(new Set());
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);

  // 詳細表示と音声用
  const [expandedWordIndex, setExpandedWordIndex] = useState<number | null>(null);

  // デモ動画切り替え用
  const [activeDemo, setActiveDemo] = useState<'generate' | 'example'>('generate');

  const speak = (text: string) => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      window.speechSynthesis.speak(utterance);
    }
  };

  // 初回ロード時にデータをAPIから取得
  useEffect(() => {
    if (session?.user) {
      fetchDecks();
      fetchFolders();
      fetchCredits();
    } else {
      setSavedDecks([]);
      setFolders([]);
    }
  }, [session]);

  const fetchDecks = async () => {
    try {
      const res = await fetch("/api/decks");
      if (res.ok) {
        const data = await res.json();
        setSavedDecks(data);
      }
    } catch (e) {
      console.error("Failed to fetch decks", e);
    }
  };

  const fetchFolders = async () => {
    try {
      const res = await fetch("/api/folders");
      if (res.ok) {
        const data = await res.json();
        setFolders(data);
      }
    } catch (e) {
      console.error("Failed to fetch folders", e);
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      const res = await fetch("/api/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newFolderName }),
      });
      if (res.ok) {
        setNewFolderName("");
        setShowCreateFolderModal(false);
        fetchFolders();
      }
    } catch (e) {
      console.error(e);
      alert("フォルダ作成に失敗しました");
    }
  };

  const handleDeleteFolder = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("フォルダを削除しますか？\n(中の単語帳は削除されません)")) return;
    try {
      const res = await fetch(`/api/folders/${id}`, { method: "DELETE" });
      if (res.ok) {
        fetchFolders();
        fetchDecks(); // フォルダから出たデッキの再取得も兼ねて
      }
    } catch (e) {
      console.error(e);
    }
  };

  const toggleFolder = (id: string) => {
    const newSet = new Set(expandedFolderIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setExpandedFolderIds(newSet);
  };

  // --- Drag and Drop (dnd-kit) Logic ---
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const [activeId, setActiveId] = useState<string | null>(null);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    // Case 1: Dropped into a Folder (overId is a Folder ID)
    const isOverFolder = folders.some(f => f.id === overId);

    if (isOverFolder) {
      await moveDeckToFolder(activeId, overId);
      return;
    }

    // Case 2: Dropped into Root Area (overId is 'ROOT')
    if (overId === 'ROOT') {
      await moveDeckToFolder(activeId, null);
      return;
    }

    // Case 3: Reordering or Cross-Folder Move via Deck Drop
    if (activeId !== overId) {
      const activeDeck = savedDecks.find(d => d.id === activeId);
      const overDeck = savedDecks.find(d => d.id === overId);

      if (activeDeck && overDeck) {
        // If dropping on a deck in a DIFFERENT folder, treat as Move
        if (activeDeck.folderId !== overDeck.folderId) {
          await moveDeckToFolder(activeId, overDeck.folderId ?? null); // If overDeck is in root (null), move to null.
          return;
        }

        // Same folder: Reorder
        setSavedDecks((items) => {
          const oldIndex = items.findIndex((item) => item.id === activeId);
          const newIndex = items.findIndex((item) => item.id === overId);
          const newOrder = arrayMove(items, oldIndex, newIndex);

          saveOrder(newOrder);
          return newOrder;
        });
      }
    }
  };

  const saveOrder = async (decks: Deck[]) => {
    // Create minimal payload: [{id, order}]
    const orderData = decks.map((d, index) => ({ id: d.id, order: index }));
    try {
      await fetch("/api/decks/reorder", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: orderData })
      });
    } catch (e) { console.error(e); }
  };

  const moveDeckToFolder = async (deckId: string, folderId: string | null) => {
    try {
      // Optimistic Update
      setSavedDecks(prev => prev.map(d => d.id === deckId ? { ...d, folderId } : d));

      // Open folder if moved into one
      if (folderId) {
        setExpandedFolderIds(prev => {
          const next = new Set(prev);
          next.add(folderId);
          return next;
        });
      }

      const res = await fetch(`/api/decks/${deckId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderId })
      });

      if (!res.ok) throw new Error("Failed to move deck");
      // fetchDecks(); // No need to fetch if optimistic is correct, but safer to keep synced eventually
    } catch (e) {
      console.error(e);
      alert("移動に失敗しました");
      fetchDecks();
    }
  };

  // --- Folder Renaming State ---
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [tempFolderName, setTempFolderName] = useState("");

  const startRenameFolder = (id: string, name: string) => {
    setEditingFolderId(id);
    setTempFolderName(name);
  };

  const saveRenameFolder = async (id: string, newName: string) => {
    if (!newName.trim()) return;
    try {
      const res = await fetch(`/api/folders/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName }),
      });
      if (res.ok) {
        setEditingFolderId(null);
        fetchFolders();
      }
    } catch (e) {
      alert("変更に失敗しました");
    }
  };

  const [credits, setCredits] = useState<number | null>(null);
  const [userPlan, setUserPlan] = useState<string | null>(null);
  const [xp, setXp] = useState<number>(0);
  const [badges, setBadges] = useState<any[]>([]);
  const [showLevelUp, setShowLevelUp] = useState(false);
  const [prevLevel, setPrevLevel] = useState<number | null>(null);
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
  const [subscriptionLoading, setSubscriptionLoading] = useState(false);

  const fetchCredits = async () => {
    try {
      const res = await fetch("/api/user/credits");
      if (res.ok) {
        const data = await res.json();
        const newXp = data.xp || 0;
        const { level: newLevel } = getLevelInfo(newXp);

        // レベルアップ判定
        if (prevLevel !== null && newLevel > prevLevel) {
          setShowLevelUp(true);
          setTimeout(() => setShowLevelUp(false), 4000);
        }

        setCredits(data.credits);
        setUserPlan(data.subscriptionPlan);
        setXp(newXp);
        setBadges(data.badges || []);
        setPrevLevel(newLevel);
      }
    } catch (e) {
      console.error("Failed to fetch credits", e);
    }
  };

  const handleSubscription = async (plan: 'basic' | 'pro') => {
    setSubscriptionLoading(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });

      if (!res.ok) {
        const error = await res.json();
        alert(error.error || "エラーが発生しました");
        setSubscriptionLoading(false);
        return;
      }

      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      console.error(error);
      alert("通信エラーが発生しました");
      setSubscriptionLoading(false);
    }
  };

  // Contact Form State
  const [contactEmail, setContactEmail] = useState("");
  const [contactMessage, setContactMessage] = useState("");
  const [contactType, setContactType] = useState("other");
  const [isSendingContact, setIsSendingContact] = useState(false);

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSendingContact(true);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: contactEmail, message: contactMessage, type: contactType })
      });
      if (res.ok) {
        alert("送信しました！貴重なご意見ありがとうございます。");
        setContactMessage("");
        setContactType("other");
      } else {
        alert("送信に失敗しました。時間をおいて再試行してください。");
      }
    } catch (err) {
      alert("エラーが発生しました。");
    } finally {
      setIsSendingContact(false);
    }
  };

  // 支払い成功後の処理
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get('success')) {
      // クレジットを再取得
      setTimeout(() => {
        if (session?.user) {
          fetchCredits();
        }
      }, 2000); // Stripe webhookの処理完了を待つため2秒待機
      // URLからパラメータを削除
      window.history.replaceState({}, document.title, '/');
    }
  }, [session]);


  // デッキ保存処理
  const handleSaveDeck = async () => {
    if (!words.length) return;
    if (!deckTitle.trim()) {
      alert("保存する単語帳に名前をつけてください");
      return;
    }

    try {
      const res = await fetch("/api/decks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: deckTitle, words }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Server Error");
      }

      const newDeck = await res.json();
      setDeckTitle("");
      setWords([]); // 保存後にリストをクリア
      alert(`"${newDeck.title}" を保存しました！`);

      // リスト更新
      fetchDecks();
    } catch (e: any) {
      console.error(e);
      alert(`保存に失敗しました: ${e.message}`);
    }
  };

  // デッキ削除処理
  const handleDeleteDeck = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("本当にこの単語帳を削除しますか？")) return;

    try {
      const res = await fetch(`/api/decks/${id}`, { method: "DELETE" });
      if (res.ok) {
        fetchDecks(); // リスト再取得
      } else {
        const errData = await res.json().catch(() => ({}));
        alert(`削除失敗: ${errData.error || "Unknown error"}`);
      }
    } catch (e) {
      console.error(e);
      alert("削除に失敗しました");
    }
  };



  // 単語帳クリック時の処理（詳細ページへ遷移）
  const handleDeckClick = (deckId: string) => {
    router.push(`/decks/${deckId}`);
  };

  const handleGenerate = async () => {
    if (!wordInput.trim()) return;

    // 行数チェック（合計10行制限）
    const lineCount = wordInput.split("\n").filter(line => line.trim() !== "").length;

    if (lineCount > 10) {
      alert(`一度に生成できるのは最大10項目までです。\n現在の入力: ${lineCount}項目\n\n品質を保つため、10項目以下に分割して入力してください。`);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/ai-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: wordInput,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));

        if (response.status === 403 && errorData.type === "credit_limit") {
          alert(errorData.error || "クレジットが不足しています。");
          setShowSubscriptionModal(true);
          return;
        }

        throw new Error(errorData.error || "Failed to generate vocabulary");
      }

      const data = await response.json();
      if (data.words) {
        // 既存のリストに追加（追記モード）
        setWords((prev) => [...prev, ...data.words]);
        setWordInput("");

        // クレジットとXPを再取得
        fetchCredits();
      } else {
        throw new Error("Invalid response format");
      }
    } catch (err) {
      console.error(err);
      setError("AI生成中にエラーが発生しました。");
    } finally {
      setLoading(false);
    }
  };

  // 単語個別削除
  const handleRemoveWord = (index: number) => {
    if (confirm("この単語をリストから削除しますか？")) {
      setWords((prev) => prev.filter((_, i) => i !== index));
    }
  };

  // リスト全クリア
  const handleClearList = () => {
    if (words.length === 0) return;
    if (confirm("現在作成中のリストを全て消去しますか？\n（この操作は取り消せません）")) {
      setWords([]);
      setDeckTitle("");
    }
  };

  // 既存のデッキに追加するためのステート (既に定義済み)

  // 既存のデッキに追加処理
  const handleAddToExistingDeck = async (deckId: string, deckTitle: string) => {
    if (!words.length) return;

    // 重複チェック
    const targetDeck = savedDecks.find(d => d.id === deckId);
    let wordsToAdd = [...words];
    let skippedWords: string[] = [];

    if (targetDeck) {
      const existingWords = new Set(targetDeck.words.map(w => w.word.toLowerCase().trim()));
      wordsToAdd = words.filter(w => {
        const isDuplicate = existingWords.has(w.word.toLowerCase().trim());
        if (isDuplicate) {
          skippedWords.push(w.word);
        }
        return !isDuplicate;
      });
    }

    // 全て重複していた場合
    if (wordsToAdd.length === 0) {
      alert(`選択した単語は、すでに "${deckTitle}" にすべて登録されています。`);
      return;
    }

    // メッセージの構築
    let message = `"${deckTitle}" に ${wordsToAdd.length} 語を追加しますか？`;
    if (skippedWords.length > 0) {
      const details = skippedWords.length > 5
        ? `${skippedWords.slice(0, 5).join(", ")}... 他${skippedWords.length - 5}語`
        : skippedWords.join(", ");
      message += `\n\n⚠️ ${skippedWords.length} 語の重複をスキップします：\n(${details})`;
    }

    if (!confirm(message)) return;

    try {
      const res = await fetch(`/api/decks/${deckId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ words: wordsToAdd }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Server Error");
      }

      const successMsg = skippedWords.length > 0
        ? `"${deckTitle}" に ${wordsToAdd.length} 語を追加しました！\n(${skippedWords.length} 語は重複のためスキップされました)`
        : `"${deckTitle}" に追加しました！`;

      alert(successMsg);
      setShowAddToDeckModal(false);
      setWords([]); // 追加後はクリア
      fetchDecks(); // 一覧更新
    } catch (e: any) {
      console.error(e);
      alert(`追加に失敗しました: ${e.message}`);
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-neutral-100 p-6 sm:p-12 font-sans transition-colors duration-300 overflow-x-hidden relative">

      {/* 🌌 Ambient Background Glow */}
      <div className="fixed top-0 left-0 w-full h-full pointer-events-none z-0 overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] bg-indigo-500/5 blur-[120px] rounded-full animate-pulse"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40vw] h-[40vw] bg-purple-500/5 blur-[100px] rounded-full animate-pulse delay-1000"></div>
      </div>

      {/* Level Up Animation Overlay */}
      {showLevelUp && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none">
          <div className="bg-indigo-600 text-white px-12 py-8 rounded-3xl shadow-2xl animate-in zoom-in fade-in duration-500 flex flex-col items-center gap-4 border-4 border-white/20">
            <span className="text-6xl animate-bounce">🎊</span>
            <div className="text-center">
              <h2 className="text-4xl font-black italic tracking-tighter uppercase">Level Up!</h2>
              <p className="text-indigo-100 font-bold mt-2">Level {prevLevel} → {prevLevel! + 1}</p>
            </div>
            <div className="text-2xl">✨✨✨</div>
          </div>
        </div>
      )}

      {/* Create Folder Modal */}
      {showCreateFolderModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-neutral-900 w-full max-w-sm rounded-2xl p-6 shadow-2xl border border-neutral-800">
            <h3 className="text-xl font-bold mb-4">新規フォルダ作成</h3>
            <input
              type="text"
              className="w-full px-4 py-2 mb-4 rounded-lg bg-neutral-800 border-none focus:ring-2 focus:ring-indigo-500 outline-none"
              placeholder="フォルダ名 (例: TOEIC, 旅行)"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowCreateFolderModal(false)}
                className="px-4 py-2 rounded-lg text-sm font-bold text-neutral-500 hover:bg-neutral-800 transition-colors"
              >
                キャンセル
              </button>
              <button
                onClick={handleCreateFolder}
                className="px-4 py-2 rounded-lg text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
                disabled={!newFolderName.trim()}
              >
                作成
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add To Deck Modal */}
      {showAddToDeckModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-neutral-900 w-full max-w-md rounded-2xl p-6 shadow-2xl border border-neutral-800">
            <h3 className="text-xl font-bold mb-4">どの単語帳に追加しますか？</h3>
            <div className="max-h-[60vh] overflow-y-auto flex flex-col gap-2 mb-4">
              {savedDecks.length === 0 ? (
                <p className="text-neutral-500 text-center py-4">保存された単語帳がありません</p>
              ) : (
                savedDecks.map((deck) => (
                  <button
                    key={deck.id}
                    onClick={() => handleAddToExistingDeck(deck.id, deck.title)}
                    className="flex justify-between items-center p-4 rounded-xl border border-neutral-800 hover:bg-neutral-800 transition-colors text-left group"
                  >
                    <span className="font-bold">{deck.title}</span>
                    <span className="text-xs text-neutral-400 group-hover:text-indigo-500">
                      + Add here
                    </span>
                  </button>
                ))
              )}
            </div>
            <button
              onClick={() => setShowAddToDeckModal(false)}
              className="w-full py-3 rounded-xl bg-neutral-800 font-bold text-sm hover:opacity-80 transition-opacity"
            >
              キャンセル
            </button>
          </div>
        </div>
      )}

      {/* Subscription Modal */}
      {showSubscriptionModal && (
        <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4 animate-in fade-in duration-300 backdrop-blur-xl">
          <div className="bg-[#050505] w-full max-w-2xl rounded-[2.5rem] p-8 sm:p-12 shadow-2xl border border-neutral-800 overflow-hidden relative">
            {/* Background Gradients (Aurora Effect) inside Modal */}
            <div className="absolute top-[-10%] left-[-10%] w-[300px] h-[300px] bg-purple-500/10 blur-[80px] rounded-full pointer-events-none"></div>
            <div className="absolute bottom-[-10%] right-[-10%] w-[300px] h-[300px] bg-indigo-500/10 blur-[80px] rounded-full pointer-events-none"></div>

            <div className="relative z-10 text-center mb-10">
              <h3 className="text-3xl sm:text-4xl font-black mb-3 text-white" style={{ fontFamily: 'var(--font-merriweather)' }}>Upgrade Plan</h3>
              <p className="text-neutral-400 text-sm sm:text-base">
                AI単語生成をもっと自由に。プランを選んでアップグレード。
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-6 relative z-10 mb-10">
              {/* Basic Plan */}
              <div className="p-6 rounded-3xl border border-neutral-800 bg-neutral-900/50 hover:border-emerald-500/50 transition-all flex flex-col group">
                <div className="mb-6">
                  <div className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.2em] mb-2">Basic Plan</div>
                  <div className="text-4xl font-black text-white">¥300<span className="text-sm font-normal text-neutral-500"> / 月</span></div>
                </div>
                <ul className="text-sm space-y-3 mb-8 flex-1 text-left">
                  <li className="flex items-center gap-3 text-neutral-300">
                    <span className="text-emerald-500 font-bold">✓</span> <span className="font-bold text-white">500</span> クレジット付与 / 月
                  </li>
                  <li className="flex items-center gap-3 text-neutral-300">
                    <span className="text-emerald-500 font-bold">✓</span> 広告なしで集中学習
                  </li>
                  <li className="flex items-center gap-3 text-neutral-300">
                    <span className="text-emerald-500 font-bold">✓</span> 基本的な機能へアクセス
                  </li>
                </ul>
                <button
                  onClick={() => handleSubscription('basic')}
                  disabled={subscriptionLoading}
                  className="w-full py-4 bg-neutral-800 text-white rounded-2xl font-bold hover:bg-neutral-700 transition-all disabled:opacity-50 active:scale-95"
                >
                  {subscriptionLoading ? "処理中..." : "Basicを選択"}
                </button>
              </div>

              {/* Pro Plan */}
              <div className="p-6 rounded-3xl border border-indigo-500/30 bg-indigo-500/5 hover:border-indigo-500 transition-all shadow-xl flex flex-col relative overflow-hidden group">
                <div className="absolute top-0 right-0 bg-indigo-600 text-white text-[10px] font-black px-4 py-1.5 rounded-bl-2xl tracking-widest">RECOMMENDED</div>
                <div className="mb-6">
                  <div className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em] mb-2">Pro Plan</div>
                  <div className="text-4xl font-black text-white">¥980<span className="text-sm font-normal text-neutral-500"> / 月</span></div>
                </div>
                <ul className="text-sm space-y-3 mb-8 flex-1 text-left">
                  <li className="flex items-center gap-3 text-neutral-300 font-bold">
                    <span className="text-indigo-500 font-bold text-lg">✓</span> <span className="text-white">2000</span> クレジット付与 / 月
                  </li>
                  <li className="flex items-center gap-3 text-neutral-300">
                    <span className="text-indigo-500 font-bold text-lg">✓</span> 全機能へのフルアクセス
                  </li>
                  <li className="flex items-center gap-3 text-neutral-300 font-bold text-indigo-300">
                    <span className="text-indigo-500 font-bold text-lg">✓</span> AI 優先処理 & 速度向上
                  </li>
                </ul>
                <button
                  onClick={() => handleSubscription('pro')}
                  disabled={subscriptionLoading}
                  className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-500 hover:shadow-lg hover:shadow-indigo-500/20 transition-all disabled:opacity-50 active:scale-95"
                >
                  {subscriptionLoading ? "処理中..." : "Proを選択"}
                </button>
              </div>
            </div>

            <button
              onClick={() => setShowSubscriptionModal(false)}
              className="w-full py-2 text-neutral-500 hover:text-white font-bold transition-colors text-sm"
            >
              戻る
            </button>
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto flex flex-col gap-8">
        {!session ? (
          <div className="flex flex-col gap-24 pb-24">
            {/* Hero Section */}
            <section className="relative pt-24 pb-12 px-6 flex flex-col items-center text-center">
              {/* Background Gradients */}
              {/* Background Gradients (Aurora Effect) */}
              <div className="absolute top-[-20%] left-[-10%] w-[700px] h-[700px] bg-purple-400/20 blur-[120px] rounded-full -z-10 animate-pulse delay-700"></div>
              <div className="absolute top-[10%] right-[-10%] w-[600px] h-[600px] bg-indigo-500/20 blur-[120px] rounded-full -z-10 animate-pulse"></div>
              <div className="absolute bottom-[-10%] left-[20%] w-[500px] h-[500px] bg-sky-400/20 blur-[100px] rounded-full -z-10 animate-pulse delay-1000"></div>

              {/* Voca Brand Header */}
              <div className="mb-6 animate-in fade-in slide-in-from-top-8 duration-1000">
                <h2 className="text-4xl sm:text-5xl font-black tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-indigo-300 via-purple-300 to-indigo-300" style={{ fontFamily: 'var(--font-merriweather)' }}>
                  Voca
                </h2>
              </div>

              {/* Badge */}
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-900/30 border border-indigo-800 text-indigo-300 text-xs font-bold mb-8 animate-in fade-in slide-in-from-bottom-4 delay-100">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                </span>
                New: AI Sentence Generation
              </div>

              <h1 className="text-5xl sm:text-7xl md:text-8xl font-black tracking-tighter mb-16 bg-clip-text text-transparent bg-white animate-in fade-in slide-in-from-bottom-8 duration-700 leading-tight" style={{ fontFamily: 'var(--font-merriweather)' }}>
                Learn Words for<br />
                <span className="text-indigo-400 inline-block min-h-[1.2em]">
                  <Typewriter
                    options={{
                      strings: ['Business.', 'Travel.', 'Science.', 'Life.', 'Everything.'],
                      autoStart: true,
                      loop: true,
                      deleteSpeed: 50,
                      delay: 80,
                    }}
                  />
                </span>
              </h1>

              <p className="text-xl sm:text-2xl text-neutral-400 max-w-2xl mx-auto mb-12 leading-relaxed animate-in fade-in slide-in-from-bottom-8 duration-700 delay-100">
                AIがあなたのためだけに単語帳を作成。<br className="hidden sm:block" />
                意味、例文、音声、すべてが一瞬で手に入ります。
              </p>

              <div className="animate-in fade-in slide-in-from-bottom-8 duration-700 delay-200 z-10 relative">
                <button
                  onClick={() => signIn("google")}
                  className="group relative px-8 py-4 bg-white text-black rounded-full font-bold text-lg hover:shadow-2xl hover:shadow-indigo-500/20 transition-all active:scale-95 flex items-center gap-3 overflow-hidden"
                >
                  <span className="relative z-10 flex items-center gap-2">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /><polyline points="10 17 15 12 10 7" /><line x1="15" y1="12" x2="3" y2="12" /></svg>
                    Googleで始める
                  </span>
                  <div className="absolute inset-0 bg-indigo-600 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out"></div>
                </button>

              </div>

              {/* MacBook Video Container */}
              <div className="mt-24 relative w-full max-w-5xl mx-auto perspective-1000 animate-in fade-in slide-in-from-bottom-12 duration-1000 delay-300">
                {/* Laptop Body */}
                <div className="relative bg-neutral-900 border-[10px] border-neutral-800 rounded-[2rem] shadow-2xl overflow-hidden aspect-video mx-auto transform rotate-x-6 origin-bottom group hover:scale-[1.02] transition-transform duration-500">
                  {/* Camera Notion */}
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-6 bg-neutral-800 rounded-b-xl z-20 flex items-center justify-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-neutral-700"></div>
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-900/50"></div>
                  </div>

                  {/* Screen Content (Video Placeholder) */}
                  <div className="relative w-full h-full bg-black flex items-center justify-center overflow-hidden">
                    <video
                      key={activeDemo} // Key change forces re-render/reload when source changes
                      src={activeDemo === 'generate' ? "/demo.mp4" : "/demoexample.mp4"}
                      autoPlay
                      loop
                      muted
                      playsInline
                      className="w-full h-full object-cover animate-in fade-in duration-500"
                    />

                    {/* Glass Reflection Effect */}
                    <div className="absolute inset-0 bg-gradient-to-tr from-white/5 to-transparent pointer-events-none z-10"></div>
                  </div>
                </div>

                {/* Laptop Base Reflection/Shadow */}
                <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-[90%] h-4 bg-black/40 blur-xl rounded-[100%]"></div>

                {/* Video Switcher Controls */}
                <div className="flex justify-center gap-4 mt-12 mb-12">
                  <button
                    onClick={() => setActiveDemo('generate')}
                    className={`px-6 py-2 rounded-full font-bold text-sm transition-all ${activeDemo === 'generate' ? 'bg-white text-black shadow-xl shadow-indigo-500/20 scale-105 ring-2 ring-indigo-500/20' : 'bg-neutral-800/50 text-neutral-400 hover:bg-neutral-800 border border-transparent'}`}
                  >
                    ⚡ 生成デモ
                  </button>
                  <button
                    onClick={() => setActiveDemo('example')}
                    className={`px-6 py-2 rounded-full font-bold text-sm transition-all ${activeDemo === 'example' ? 'bg-white text-black shadow-xl shadow-emerald-500/20 scale-105 ring-2 ring-emerald-500/20' : 'bg-neutral-800/50 text-neutral-400 hover:bg-neutral-800 border border-transparent'}`}
                  >
                    📖 学習デモ
                  </button>
                </div>

                {/* Dynamic Description Text */}
                <div className="text-center max-w-2xl mx-auto px-6 relative">
                  {activeDemo === 'generate' ? (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                      <h3 className="text-2xl font-bold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-purple-400">
                        AIが、面倒な「単語帳作り」を終わらせます
                      </h3>
                      <p className="text-neutral-400 leading-relaxed font-medium">
                        覚えたい単語を入力するだけ。AIが文脈を理解し、<br className="hidden sm:block" />
                        最適な日本語訳・例文・音声を<span className="text-indigo-400 font-bold">一瞬でセットアップ</span>します。<br />
                        もう辞書を引く必要はありません。
                      </p>
                    </div>
                  ) : (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                      <h3 className="text-2xl font-bold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-teal-400">
                        「見るだけ」の暗記は、もう古い
                      </h3>
                      <p className="text-neutral-400 leading-relaxed font-medium">
                        フラッシュカードはもちろん、<span className="text-emerald-400 font-bold">ライティングテストや書き取り</span>も搭載。<br />
                        実際に「書いて」「聞いて」出力することで、<br className="hidden sm:block" />
                        使える英語として脳に定着させます。
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* Bento Grid Features */}
            <section className="px-6 max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Large Feature: AI Generation */}
              <div className="md:col-span-2 relative group overflow-hidden rounded-3xl bg-neutral-900 border border-neutral-800 p-8 sm:p-12 transition-all hover:border-indigo-500/50">
                <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>
                <div className="absolute -right-20 -top-20 w-80 h-80 bg-indigo-500/20 rounded-full blur-[100px] pointer-events-none"></div>

                <div className="relative z-10 flex flex-col h-full justify-between">
                  <div>
                    <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 flex items-center justify-center mb-6 text-indigo-400">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" /></svg>
                    </div>
                    <h3 className="text-2xl font-bold text-white mb-4">AI自動生成</h3>
                    <p className="text-neutral-400 leading-relaxed max-w-md">
                      単語を入力するだけ。意味、品詞、そして文脈に沿った最適な例文をAIが瞬時に生成します。<br />
                      <span className="text-indigo-400">辞書を引く時間はもう必要ありません。</span>
                    </p>
                  </div>
                </div>
              </div>

              {/* Tall Feature: Gamification */}
              <div className="md:row-span-2 relative group overflow-hidden rounded-3xl bg-neutral-900 border border-neutral-800 p-8 flex flex-col justify-between transition-all hover:border-orange-500/50">
                <div className="absolute inset-0 bg-gradient-to-t from-orange-500/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>

                <div className="relative z-10">
                  <div className="w-12 h-12 rounded-2xl bg-orange-500/20 flex items-center justify-center mb-6 text-orange-400">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" /></svg>
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2">継続をゲームにする</h3>
                  <p className="text-neutral-400 text-sm">
                    XPを稼ぎ、レベルを上げ、バッジを集める。学習がゲームのような楽しさに。
                  </p>
                </div>

                <div className="mt-8 relative z-10">
                  <div className="flex justify-between items-end mb-2">
                    <span className="text-xs font-mono text-orange-400">現在のレベル</span>
                    <span className="text-xl font-bold text-white">Lvl. 5</span>
                  </div>
                  <div className="w-full bg-neutral-800 h-2 rounded-full overflow-hidden">
                    <div className="w-[70%] h-full bg-gradient-to-r from-orange-500 to-red-500 animate-pulse"></div>
                  </div>
                </div>
              </div>

              {/* Small Feature: Writing Test */}
              <div className="relative group overflow-hidden rounded-3xl bg-neutral-900 border border-neutral-800 p-8 flex flex-col transition-all hover:border-emerald-500/50">
                <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>
                <div className="relative z-10">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 flex items-center justify-center mb-4 text-emerald-400">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /><path d="m15 5 4 4" /></svg>
                  </div>
                  <h3 className="font-bold text-white mb-1">ライティング・テスト</h3>
                  <p className="text-xs text-neutral-400">
                    覚えた単語をタイピングして出力。<br />
                    <span className="text-emerald-400">「使える英語」</span>が身につきます。
                  </p>
                </div>
              </div>

              {/* Small Feature: Smart Review */}
              <div className="relative group overflow-hidden rounded-3xl bg-neutral-900 border border-neutral-800 p-8 flex flex-col transition-all hover:border-pink-500/50">
                <div className="absolute inset-0 bg-gradient-to-br from-pink-500/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>
                <div className="relative z-10">
                  <div className="w-12 h-12 rounded-2xl bg-pink-500/20 flex items-center justify-center mb-4 text-pink-400">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a10 10 0 1 0 10 10 4 4 0 0 1-5-5 4 4 0 0 1-5-5" /><path d="M8.5 8.5v.01" /><path d="M16 15.5v.01" /><path d="M12 12v.01" /><path d="M8.5 15.5v.01" /><path d="M16 8.5v.01" /></svg>
                  </div>
                  <h3 className="font-bold text-white mb-1">記憶定着レビュー</h3>
                  <p className="text-xs text-neutral-400">
                    間違えた単語だけを自動でピックアップ。<br />
                    <span className="text-pink-400">効率的な復習サイクル。</span>
                  </p>
                </div>
              </div>
            </section>

            {/* How it Works / Step by Step */}
            <section className="px-6 py-24 max-w-7xl mx-auto">
              <div className="text-center mb-16">
                <h2 className="text-3xl font-bold mb-4">使い方</h2>
                <p className="text-neutral-500">たったの3ステップで、あなただけの単語帳が完成します。</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="relative p-8 rounded-3xl bg-neutral-900 border border-neutral-800 text-center shadow-sm">
                  <div className="absolute -top-6 left-1/2 -translate-x-1/2 w-12 h-12 bg-neutral-800 border-4 border-neutral-900 rounded-full flex items-center justify-center text-xl font-black text-indigo-500 shadow-sm">1</div>
                  <h3 className="font-bold text-lg mt-4 mb-2">単語を入力</h3>
                  <p className="text-sm text-neutral-500 leading-relaxed">覚えたい単語や文章をテキストエリアに入力するだけ。複数まとめてもOK。</p>
                </div>
                <div className="relative p-8 rounded-3xl bg-neutral-900 border border-neutral-800 text-center shadow-sm">
                  <div className="absolute -top-6 left-1/2 -translate-x-1/2 w-12 h-12 bg-neutral-800 border-4 border-neutral-900 rounded-full flex items-center justify-center text-xl font-black text-indigo-500 shadow-sm">2</div>
                  <h3 className="font-bold text-lg mt-4 mb-2">AIが瞬時に生成</h3>
                  <p className="text-sm text-neutral-500 leading-relaxed">最適な日本語訳、実用的な例文、発音データをAIが自動でセットアップします。</p>
                </div>
                <div className="relative p-8 rounded-3xl bg-neutral-900 border border-neutral-800 text-center shadow-sm">
                  <div className="absolute -top-6 left-1/2 -translate-x-1/2 w-12 h-12 bg-neutral-800 border-4 border-neutral-900 rounded-full flex items-center justify-center text-xl font-black text-indigo-500 shadow-sm">3</div>
                  <h3 className="font-bold text-lg mt-4 mb-2">学習スタート</h3>
                  <p className="text-sm text-neutral-500 leading-relaxed">フラッシュカード、穴埋めテスト、書き取りテストで確実に記憶に定着させます。</p>
                </div>
              </div>
            </section>

            {/* Stats Section */}
            <section className="py-24 bg-neutral-900 text-white rounded-[3rem] mx-4 relative overflow-hidden">
              <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 brightness-100 contrast-150 mix-blend-overlay"></div>
              <div className="max-w-6xl mx-auto px-6 grid grid-cols-1 md:grid-cols-3 gap-12 text-center relative z-10">
                <div className="space-y-2">
                  <div className="text-5xl sm:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-b from-white to-white/50">
                    <CountUp end={50000} duration={2.5} separator="," suffix="+" />
                  </div>
                  <div className="text-sm font-bold tracking-widest uppercase text-neutral-400">生成された単語数</div>
                </div>
                <div className="space-y-2">
                  <div className="text-5xl sm:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-b from-indigo-400 to-indigo-200">
                    <CountUp end={95} duration={3} suffix="%" />
                  </div>
                  <div className="text-sm font-bold tracking-widest uppercase text-indigo-200">記憶定着率</div>
                </div>
                <div className="space-y-2">
                  <div className="text-5xl sm:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-b from-white to-white/50">
                    <CountUp end={5000} duration={2.5} separator="," suffix="+" />
                  </div>
                  <div className="text-sm font-bold tracking-widest uppercase text-neutral-400">学習セッション数</div>
                </div>
              </div>
            </section>

            {/* Footer Call to Action */}
            <section className="text-center py-24 px-6">
              <h2 className="text-3xl font-bold mb-8">さあ、新しい学習体験へ。</h2>
              <button
                onClick={() => signIn("google")}
                className="px-12 py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full font-bold shadow-xl shadow-indigo-500/30 hover:shadow-indigo-500/50 transition-all hover:scale-105 active:scale-95"
              >
                無料で始める
              </button>
              <p className="mt-6 text-sm text-neutral-400">Googleアカウントですぐに使えます</p>
            </section>

            {/* Contact Form Section */}
            <section className="py-12 px-6 bg-neutral-900 border-t border-neutral-800">
              <div className="max-w-lg mx-auto">
                <div className="text-center mb-6">
                  <h2 className="text-xl font-bold mb-1">お問い合わせ</h2>
                  <p className="text-xs text-neutral-500">不具合の報告や、機能のリクエストはこちらから。</p>
                </div>
                <form onSubmit={handleContactSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-neutral-300 mb-1">メールアドレス</label>
                    <input
                      type="email"
                      required
                      value={contactEmail}
                      onChange={(e) => setContactEmail(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-neutral-800 bg-neutral-800 focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-sm"
                      placeholder="your@email.com"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-neutral-300 mb-1">種類</label>
                    <select
                      value={contactType}
                      onChange={(e) => setContactType(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-neutral-800 bg-neutral-800 focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-sm"
                    >
                      <option value="bug">不具合報告 (Bug)</option>
                      <option value="feature">機能リクエスト (Feature Request)</option>
                      <option value="other">その他 (Other)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-neutral-300 mb-1">内容</label>
                    <textarea
                      required
                      value={contactMessage}
                      onChange={(e) => setContactMessage(e.target.value)}
                      rows={3}
                      className="w-full px-3 py-2 rounded-lg border border-neutral-800 bg-neutral-800 focus:ring-2 focus:ring-indigo-500 outline-none transition-all resize-none text-sm"
                      placeholder="詳細をご記入ください..."
                    ></textarea>
                  </div>
                  <button
                    type="submit"
                    disabled={isSendingContact}
                    className="w-full py-2.5 bg-white text-black rounded-lg font-bold hover:opacity-90 transition-opacity disabled:opacity-50 text-sm"
                  >
                    {isSendingContact ? "送信中..." : "送信する"}
                  </button>
                </form>
              </div>
            </section>

            {/* Footer Removed as requested */}
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row justify-between items-center pt-2 sm:pt-4 gap-3 sm:gap-4">

            {/* Gamification Stats */}
            <div className="flex flex-col gap-2 w-full sm:w-auto">
              <Link href="/profile" className="block group">
                <div className="flex items-center gap-2 sm:gap-6 bg-neutral-900 px-3 py-2 sm:px-6 sm:py-3 rounded-full border border-neutral-800 shadow-sm group-hover:border-indigo-300 transition-colors cursor-pointer">
                  <div className="flex items-center gap-2 sm:gap-3">
                    <div className="relative">
                      <span className="text-xl sm:text-2xl">⭐</span>
                    </div>
                    <div className="flex flex-col min-w-[80px] sm:min-w-[140px]">
                      <div className="flex justify-between items-end mb-1">
                        <div className="flex items-baseline gap-1">
                          <span className="text-[10px] text-neutral-400 font-bold uppercase tracking-tighter">Lv.</span>
                          <span className="text-sm font-black text-white leading-none">{getLevelInfo(xp).level}</span>
                        </div>
                        <p className="text-[10px] text-indigo-500 font-bold leading-none tracking-tight">
                          {getLevelInfo(xp).xpInCurrentLevel} <span className="text-neutral-600 font-normal mx-0.5">/</span> {getLevelInfo(xp).xpRequiredForNext} <span className="text-[8px] opacity-70">XP</span>
                        </p>
                      </div>
                      {/* Progress Bar */}
                      <div className="w-full h-1.5 bg-neutral-800 rounded-full overflow-hidden shadow-inner">
                        <div
                          className="h-full bg-indigo-500 transition-all duration-1000 ease-out"
                          style={{ width: `${getLevelInfo(xp).progress}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>

                  <div className="w-px h-6 bg-neutral-800 hidden sm:block"></div>

                  <div className="flex items-center gap-2">
                    <span className="text-lg sm:text-xl">🪙</span>
                    <div>
                      <p className="text-[8px] sm:text-[10px] text-neutral-400 font-bold uppercase tracking-wider leading-none mb-0.5">コイン</p>
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-sm sm:text-base text-neutral-100 leading-none">
                          {userPlan === 'unlimited' ? "無制限" : (credits ?? "...")}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Chevron to indicate clickable */}
                  <div className="ml-auto sm:ml-0 pl-1 sm:pl-2 text-neutral-300 group-hover:text-indigo-500 transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4 sm:w-5 sm:h-5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                    </svg>
                  </div>
                </div>
              </Link>
            </div>

            <button
              onClick={() => setShowSaved(!showSaved)}
              className={`w-full sm:w-auto px-5 py-2.5 rounded-full font-bold text-sm transition-all shadow-sm border ${showSaved ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-neutral-900 border-neutral-800 hover:border-indigo-300'}`}
            >
              {showSaved ? "閉じる" : "📂 保存した単語帳を開く"}
            </button>
          </div>
        )
        }

        {
          session && (
            <>
              {showSaved ? (
                <div className="bg-neutral-900 rounded-2xl p-8 shadow-sm border border-neutral-800 animate-in fade-in slide-in-from-top-4">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-2xl font-bold flex items-center gap-2" style={{ fontFamily: 'var(--font-merriweather)' }}>
                      保存した単語帳
                    </h2>
                    <button
                      onClick={() => setShowCreateFolderModal(true)}
                      className="text-sm font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1"
                    >
                      <span className="text-lg">+</span> フォルダ作成
                    </button>
                  </div>

                  {savedDecks.length === 0 && folders.length === 0 ? (
                    <div className="text-center py-12 text-neutral-400">
                      <p>保存された単語帳はありません。</p>
                    </div>
                  ) : (
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragStart={handleDragStart}
                      onDragEnd={handleDragEnd}
                    >
                      <div className="space-y-8">
                        {/* Folders Section */}
                        {folders.length > 0 && (
                          <div className="space-y-3">
                            {folders.map(folder => (
                              <FolderRow
                                key={folder.id}
                                folder={folder}
                                folderDecks={savedDecks.filter(d => d.folderId === folder.id)}
                                isExpanded={expandedFolderIds.has(folder.id)}
                                toggleFolder={toggleFolder}
                                deleteFolder={handleDeleteFolder}
                                startRenameFolder={startRenameFolder}
                                saveRenameFolder={saveRenameFolder}
                                onDeckClick={handleDeckClick}
                              />
                            ))}
                          </div>
                        )}

                        {/* Root Decks Section */}
                        <RootDropArea>
                          <SortableContext
                            items={savedDecks.filter(d => !d.folderId).map(d => d.id)}
                            strategy={rectSortingStrategy}
                          >
                            {savedDecks.filter(d => !d.folderId).length === 0 && (
                              <div className="col-span-full flex flex-col items-center justify-center p-8 text-neutral-400 border-2 border-dashed border-neutral-200 dark:border-neutral-800 rounded-2xl">
                                <span className="text-4xl mb-2">📥</span>
                                <p className="text-sm">ここに単語帳をドロップしてフォルダから出す</p>
                              </div>
                            )}
                            {savedDecks.filter(d => !d.folderId).map(deck => (
                              <SortableDeckItem key={deck.id} deck={deck} onClick={handleDeckClick} />
                            ))}
                          </SortableContext>
                        </RootDropArea>
                      </div>

                      <DragOverlay dropAnimation={{
                        sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: '0.5' } } })
                      }}>
                        {activeId ? (
                          <div className="p-4 bg-neutral-800 rounded-xl shadow-2xl border border-indigo-500 opacity-80 w-[300px]">
                            <h3 className="font-bold">{savedDecks.find(d => d.id === activeId)?.title}</h3>
                          </div>
                        ) : null}
                      </DragOverlay>
                    </DndContext>
                  )}
                </div>
              ) : (
                <div className="grid lg:grid-cols-[400px_1fr] gap-8 items-start">
                  {/* Left: Input */}
                  <div className="flex flex-col gap-4 sticky top-8">
                    <div className="bg-neutral-900 p-5 rounded-2xl border border-neutral-800 shadow-sm">
                      <div className="mb-6">
                        <label className="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">
                          単語・フレーズを入力 <span className="text-neutral-500 font-normal ml-1 text-[10px]">(1行に1つ入力)</span>
                        </label>
                        <textarea
                          className="w-full h-[200px] p-3 text-base bg-black border border-neutral-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 resize-none font-mono leading-relaxed overflow-x-auto text-neutral-100 placeholder:text-neutral-600"
                          wrap="off"
                          placeholder={"apple\ntake off\nclimate change"}
                          value={wordInput}
                          onChange={(e) => setWordInput(e.target.value)}
                        />
                      </div>

                      <button
                        onClick={handleGenerate}
                        disabled={loading || !wordInput.trim()}
                        className={`w-full py-4 rounded-xl font-bold text-sm transition-all relative overflow-hidden group
                          ${loading
                            ? "bg-neutral-100 text-neutral-400"
                            : "bg-white text-black shadow-[0_0_20px_rgba(255,255,255,0.15)] hover:shadow-[0_0_30px_rgba(255,255,255,0.3)] hover:scale-[1.01] active:scale-[0.98]"
                          }
                        `}
                      >
                        <span className="relative z-10 flex items-center justify-center gap-2">
                          {loading ? (
                            <>
                              <svg className="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                              生成中...
                            </>
                          ) : (
                            <>
                              <span className="text-lg">✨</span> リストを生成
                            </>
                          )}
                        </span>
                        {!loading && <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-in-out"></div>}
                      </button>
                      <p className="mt-3 text-[10px] text-neutral-400 text-center leading-tight">
                        ※一度に合計10項目まで生成可能です
                      </p>
                      {error && <p className="mt-2 text-xs text-red-500 text-center">{error}</p>}
                    </div>
                  </div>

                  {/* Right: Output List */}
                  <div className="min-h-[500px]">
                    {words.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center border border-dashed border-neutral-800 rounded-3xl text-neutral-400 p-12 text-center bg-neutral-900/30 relative overflow-hidden group">

                        {/* 🃏 Floating Cards Visual (Empty State) */}
                        <div className="absolute inset-0 pointer-events-none opacity-30 select-none overflow-hidden">
                          <div className="absolute top-[20%] right-[10%] bg-neutral-800 p-3 rounded-xl shadow-lg rotate-12 animate-float delay-0 scale-75 blur-[1px]">
                            <div className="w-16 h-2 bg-neutral-700 rounded-full mb-2"></div>
                            <div className="w-8 h-2 bg-neutral-700/50 rounded-full"></div>
                          </div>
                          <div className="absolute bottom-[30%] left-[10%] bg-neutral-800 p-4 rounded-xl shadow-lg -rotate-6 animate-float delay-1000 scale-90 blur-[2px]">
                            <div className="w-20 h-2.5 bg-neutral-700 rounded-full mb-2"></div>
                            <div className="w-12 h-2.5 bg-neutral-700/50 rounded-full"></div>
                          </div>
                          <div className="absolute top-[10%] left-[20%] bg-indigo-500/10 p-2 rounded-lg rotate-[-12deg] animate-pulse">
                            <span className="text-2xl">✨</span>
                          </div>
                        </div>

                        <div className="relative z-10">
                          <div className="w-16 h-16 bg-neutral-800 rounded-2xl flex items-center justify-center text-3xl shadow-xl mb-6 mx-auto group-hover:scale-110 transition-transform duration-500">
                            🚀
                          </div>
                          <p className="whitespace-pre-line leading-relaxed font-bold text-neutral-400">
                            まずは単語・フレーズを入力して、{"\n"}
                            あなただけの学習リストを作りましょう！
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-6">
                        {/* Toolbar */}
                        <div className="bg-neutral-900 p-4 rounded-xl border border-neutral-800 shadow-sm flex flex-col sm:flex-row gap-4 items-center justify-between sticky top-8 z-10">
                          <div className="flex items-center gap-3 w-full sm:w-auto flex-1">
                            <button onClick={handleClearList} className="text-xs font-bold text-red-500 hover:bg-red-50 px-3 py-2 rounded-lg transition-colors">クリア</button>
                            <input
                              type="text"
                              value={deckTitle}
                              onChange={(e) => setDeckTitle(e.target.value)}
                              placeholder="単語帳に名前をつける..."
                              className="flex-1 bg-neutral-800 px-4 py-2 rounded-xl font-bold text-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/50 placeholder:font-normal placeholder:text-neutral-400 transition-all border-none"
                            />
                          </div>
                          <div className="flex gap-2 w-full sm:w-auto">
                            <button onClick={() => setShowAddToDeckModal(true)} className="px-4 py-2 text-xs font-bold border border-neutral-700 rounded-lg hover:bg-neutral-800 transition-colors">
                              + 既存に追加
                            </button>
                            <button onClick={handleSaveDeck} className="px-6 py-2 text-xs font-bold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-sm">
                              新規保存
                            </button>
                          </div>
                        </div>

                        {/* Words List */}
                        <div className="bg-neutral-900 rounded-xl border border-neutral-800 shadow-sm overflow-hidden">
                          {words.map((card, idx) => (
                            <div key={idx} className="group relative p-6 border-b border-neutral-800 last:border-0 hover:bg-neutral-800/50 transition-colors">
                              <button onClick={() => handleRemoveWord(idx)} className="absolute top-4 right-4 text-neutral-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all">✕</button>

                              <div className="flex items-baseline gap-4 mb-3">
                                <div className="flex items-center gap-2">
                                  <span className="text-xl font-bold text-neutral-100" style={{ fontFamily: 'var(--font-merriweather)' }}>{card.word}</span>
                                  <button
                                    onClick={() => speak(card.word)}
                                    className="p-1.5 text-neutral-300 hover:text-indigo-500 rounded-full hover:bg-neutral-800 transition-colors shrink-0"
                                    title="Play word"
                                  >
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
                                  </button>
                                </div>

                                <span className="text-neutral-300 font-medium ml-auto sm:ml-0" style={{ fontFamily: 'var(--font-noto-serif-jp)' }}>{card.meaning}</span>
                              </div>



                              <div className="absolute top-6 right-6 text-xs text-neutral-200 font-mono select-none group-hover:text-transparent">
                                #{idx + 1}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )
        }


        {/* Hidden Admin Link */}
        {
          session?.user?.email === "zhangguchuanjiang27@gmail.com" && (
            <div className="max-w-7xl mx-auto mt-12 mb-8 flex justify-center relative z-[9999] pointer-events-auto">
              <Link
                href="/sys-ctrl-99"
                className="opacity-20 hover:opacity-100 transition-opacity text-xs font-bold text-neutral-400 hover:text-indigo-500 uppercase tracking-widest border border-neutral-200 dark:border-neutral-800 px-6 py-3 rounded-full cursor-pointer bg-neutral-900/50 backdrop-blur-sm"
              >
                Admin
              </Link>
            </div>
          )
        }
      </main >
    </div >
  );
}


// --- Sortable Components ---
function SortableDeckItem({ deck, onClick }: { deck: Deck; onClick: (id: string) => void }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: deck.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 999 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative p-5 rounded-xl bg-neutral-900 border border-neutral-800 hover:shadow-lg hover:border-indigo-400 transition-all ${isDragging ? 'shadow-2xl ring-2 ring-indigo-500' : ''}`}
      onClick={(e) => {
        // Prevent click if dragging (handled by dnd-kit usually, but safety check)
        if (!isDragging) onClick(deck.id);
      }}
    >
      <div className="flex justify-between items-start mb-2">
        <h3 className="font-bold text-md pr-2 group-hover:text-indigo-400 transition-colors leading-tight select-none">
          {deck.title}
        </h3>
        <div
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-neutral-300 hover:text-neutral-500 p-2 -m-2 touch-none"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Drag Handle Icon */}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="5" r="1" /><circle cx="9" cy="12" r="1" /><circle cx="9" cy="19" r="1" /><circle cx="15" cy="5" r="1" /><circle cx="15" cy="12" r="1" /><circle cx="15" cy="19" r="1" /></svg>
        </div>
      </div>
      <div className="flex items-center gap-3 pointer-events-none select-none">
        <p className="text-[10px] text-neutral-500 font-mono bg-neutral-800 px-2 py-0.5 rounded shadow-sm">{deck.words.length} 語</p>
        <p className="text-[10px] text-neutral-400">{new Date(deck.createdAt).toLocaleDateString()}</p>
      </div>
    </div>
  );
}

function FolderRow({
  folder,
  folderDecks,
  isExpanded,
  toggleFolder,
  deleteFolder,
  onDeckClick,
  startRenameFolder,
  saveRenameFolder
}: {
  folder: Folder;
  folderDecks: Deck[];
  isExpanded: boolean;
  toggleFolder: (id: string) => void;
  deleteFolder: (id: string, e: any) => void;
  onDeckClick: (id: string) => void;
  startRenameFolder: (id: string, name: string) => void;
  saveRenameFolder: (id: string, name: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: folder.id });
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(folder.name);

  useEffect(() => setName(folder.name), [folder.name]);

  return (
    <div
      ref={setNodeRef}
      className={`rounded-2xl border transition-all duration-200 overflow-hidden mb-3
          ${isOver
          ? 'bg-indigo-900/40 border-indigo-500 scale-[1.02] shadow-xl'
          : 'bg-neutral-900/50 border-neutral-800'
        }
      `}
    >
      <div
        className="p-4 flex items-center justify-between cursor-pointer hover:bg-neutral-800/50 transition-colors"
        onClick={() => toggleFolder(folder.id)}
      >
        <div className="flex items-center gap-3">
          <span className={`text-xl transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
          <span className="text-2xl">📂</span>

          {isEditing ? (
            <div className="flex gap-2 items-center overflow-x-auto max-w-[50vw] sm:max-w-none py-1 no-scrollbar" onClick={e => e.stopPropagation()}>
              <input
                autoFocus
                value={name}
                onChange={e => setName(e.target.value)}
                className="px-2 py-1 rounded bg-black border border-indigo-500 outline-none text-sm min-w-[120px]"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    saveRenameFolder(folder.id, name);
                    setIsEditing(false);
                  }
                }}
              />
              <button onClick={() => { saveRenameFolder(folder.id, name); setIsEditing(false); }} className="text-xs font-bold text-green-500 bg-green-500/10 px-3 py-1.5 rounded whitespace-nowrap">Save</button>
              <button onClick={() => { setIsEditing(false); setName(folder.name); }} className="text-xs font-bold text-neutral-500 bg-neutral-500/10 px-3 py-1.5 rounded whitespace-nowrap">Cancel</button>
            </div>
          ) : (
            <div className="flex items-center gap-1 group/title" onClick={(e) => e.stopPropagation()}>
              <span className="font-bold text-lg text-neutral-200 group-hover/title:text-white transition-colors">{folder.name}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setName(folder.name);
                  setIsEditing(true);
                }}
                className="text-neutral-500 hover:text-indigo-400 p-1.5 rounded-md transition-colors hover:bg-neutral-800"
                title="名前を変更"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125" />
                </svg>
              </button>
            </div>
          )}
          <span className="ml-2 text-xs font-bold text-neutral-400 bg-neutral-800 px-2 py-0.5 rounded-full border border-neutral-700">
            {folderDecks.length}
          </span>
        </div>
        <button
          onClick={(e) => deleteFolder(folder.id, e)}
          className="text-neutral-300 hover:text-red-500 p-2"
          title="フォルダを削除"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
        </button>
      </div>

      {isExpanded && (
        <div className="p-4 pt-0 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-in slide-in-from-top-2">
          <SortableContext items={folderDecks.map(d => d.id)} strategy={rectSortingStrategy}>
            {folderDecks.length === 0 && <p className="col-span-full text-center text-sm text-neutral-400 py-4 italic">デッキがありません</p>}
            {folderDecks.map((deck) => (
              <SortableDeckItem key={deck.id} deck={deck} onClick={onDeckClick} />
            ))}
          </SortableContext>
        </div>
      )}
    </div>
  );
}

function RootDropArea({ children }: { children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'ROOT' });
  return (
    <div
      ref={setNodeRef}
      className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 rounded-3xl transition-all duration-300 min-h-[100px]
          ${isOver
          ? 'bg-indigo-900/20 ring-2 ring-indigo-400 ring-dashed p-4'
          : ''
        }
      `}
    >
      {children}
    </div>
  );
}
