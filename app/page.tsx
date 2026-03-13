"use client";

import { useState, useEffect } from "react";
import { signOut, useSession, signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";

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
import { Layers, Folder } from 'lucide-react';

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
  study_count?: number;
  last_studied_at?: string | null;
};

type Folder = {
  id: string;
  name: string;
  order: number;
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
  const [isEditMode, setIsEditMode] = useState(false);

  // フォルダ用ステート
  const [folders, setFolders] = useState<Folder[]>([]);
  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [showCreateEmptyDeckModal, setShowCreateEmptyDeckModal] = useState(false);
  const [isCreatingEmptyDeck, setIsCreatingEmptyDeck] = useState(false);
  const [newEmptyDeckTitle, setNewEmptyDeckTitle] = useState("");
  const [newFolderName, setNewFolderName] = useState("");
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(new Set());
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const [streak, setStreak] = useState<number>(0);
  const [mounted, setMounted] = useState(false);
  const [dailyStudyCount, setDailyStudyCount] = useState<number>(0);
  const [dailyLastStudiedAt, setDailyLastStudiedAt] = useState<string | null>(null);

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
    setMounted(true);
    if (session?.user) {
      fetchDecks();
      fetchFolders();
      fetchCredits();
      fetchStreak();
    } else {
      setSavedDecks([]);
      setFolders([]);
    }
  }, [session]);

  const fetchStreak = async () => {
    try {
      const res = await fetch("/api/user/streak");
      if (res.ok) {
        const data = await res.json();
        setStreak(data.streak);
      }
    } catch (e) {
      console.error("Failed to fetch streak", e);
    }
  };

  // ハッシュやイベントを監視して「保存した単語帳」領域を開く
  useEffect(() => {
    const checkHash = () => {
      if (window.location.hash === "#saved") {
        setShowSaved(true);
      }
    };

    // 初回マウント時
    checkHash();

    // ハッシュ変更時
    window.addEventListener("hashchange", checkHash);

    // カスタムイベント監視（BottomNavからの発火等）
    const handleOpenSaved = () => setShowSaved(true);
    const handleCloseSaved = () => setShowSaved(false);

    window.addEventListener("open-saved-decks", handleOpenSaved);
    window.addEventListener("close-saved-decks", handleCloseSaved);

    return () => {
      window.removeEventListener("hashchange", checkHash);
      window.removeEventListener("open-saved-decks", handleOpenSaved);
      window.removeEventListener("close-saved-decks", handleCloseSaved);
    };
  }, []);

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
    if (!newFolderName.trim() || isCreatingFolder) return;
    setIsCreatingFolder(true);
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
    } finally {
      setIsCreatingFolder(false);
    }
  };

  const handleCreateEmptyDeck = async () => {
    if (!newEmptyDeckTitle.trim() || isCreatingEmptyDeck) return;
    setIsCreatingEmptyDeck(true);
    try {
      const res = await fetch("/api/decks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newEmptyDeckTitle, words: [] }),
      });
      if (res.ok) {
        setNewEmptyDeckTitle("");
        setShowCreateEmptyDeckModal(false);
        fetchDecks();
      } else {
        alert("単語帳作成に失敗しました");
      }
    } catch (e) {
      console.error(e);
      alert("単語帳作成に失敗しました");
    } finally {
      setIsCreatingEmptyDeck(false);
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

    const activeIsFolder = folders.some(f => f.id === activeId);

    if (activeIsFolder) {
      if (activeId !== overId) {
        const overIsFolder = folders.some(f => f.id === overId);
        if (overIsFolder) {
          setFolders((items) => {
            const oldIndex = items.findIndex((item) => item.id === activeId);
            const newIndex = items.findIndex((item) => item.id === overId);
            const newOrder = arrayMove(items, oldIndex, newIndex);

            saveFolderOrder(newOrder);
            return newOrder;
          });
        }
      }
      return;
    }

    // Case 1: Dropped into a Folder (overId is a Folder ID or Empty Folder Drop ID)
    const isOverFolder = folders.some(f => f.id === overId);
    if (isOverFolder) {
      await moveDeckToFolder(activeId, overId);
      return;
    }

    if (overId.endsWith('-empty-drop')) {
      const targetFolderId = overId.replace('-empty-drop', '');
      await moveDeckToFolder(activeId, targetFolderId);
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

  const saveFolderOrder = async (order: Folder[]) => {
    const orderData = order.map((f, index) => ({ id: f.id, order: index }));
    try {
      await fetch("/api/folders/reorder", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: orderData })
      });
    } catch (e) { console.error(e); }
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
        setDailyStudyCount(data.dailyStudyCount || 0);
        setDailyLastStudiedAt(data.dailyLastStudiedAt || null);
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

  // デッキ名変更処理
  const saveRenameDeck = async (id: string, newTitle: string) => {
    if (!newTitle.trim()) return;
    try {
      const res = await fetch(`/api/decks/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle }),
      });
      if (res.ok) {
        fetchDecks(); // リスト再取得
      } else {
        alert("変更に失敗しました");
      }
    } catch (e) {
      console.error(e);
      alert("変更に失敗しました");
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
    const url = showSaved ? `/decks/${deckId}` : `/decks/${deckId}?from=home`;
    router.push(url);
  };

  const handleGenerate = async () => {
    if (!wordInput.trim()) return;

    // 行数チェック（合計50行制限）
    const lines = wordInput.split("\n").filter(line => line.trim() !== "");
    const lineCount = lines.length;

    if (lineCount > 50) {
      alert(`一度に生成できるのは最大50項目までです。\n現在の入力: ${lineCount}項目\n\n品質を保つため、50項目以下に分割して入力してください。`);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const BATCH_SIZE = 5;
      let allGeneratedWords: any[] = [];
      let lastError: any = null;
      let processedLinesCount = 0;

      for (let i = 0; i < lines.length; i += BATCH_SIZE) {
        const batchLines = lines.slice(i, i + BATCH_SIZE);
        const batchInput = batchLines.join("\n");

        try {
          const response = await fetch("/api/ai-generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: batchInput }),
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            if (response.status === 403 && errorData.type === "credit_limit") {
              alert(errorData.error || "クレジットが不足しています。");
              setShowSubscriptionModal(true);
              lastError = new Error("Credit limit reached");
            } else {
              lastError = new Error(errorData.error || "Failed to generate vocabulary");
            }
            break;
          }

          const data = await response.json();
          if (data.words && Array.isArray(data.words)) {
            allGeneratedWords = [...allGeneratedWords, ...data.words];
            processedLinesCount += batchLines.length;
          } else {
            lastError = new Error("Invalid response format");
            break;
          }
        } catch (fetchErr) {
          lastError = fetchErr;
          break;
        }
      }

      if (allGeneratedWords.length > 0) {
        setWords((prev) => [...prev, ...allGeneratedWords]);
        const remainingLines = lines.slice(processedLinesCount);
        setWordInput(remainingLines.join("\n"));
        fetchCredits();
      } else if (lastError) {
        throw lastError;
      } else if (processedLinesCount === lines.length) {
        setWordInput("");
      }

      if (lastError && allGeneratedWords.length > 0) {
        setError("一部の単語生成中にエラーが発生したため中断しました。" + (lastError.message ? ` (${lastError.message})` : ""));
      }

    } catch (err: any) {
      console.error(err);
      setError("AI生成中にエラーが発生しました。" + (err.message || ""));
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
    <div className="flex-1 bg-black text-neutral-100 font-sans transition-colors duration-300 overflow-x-hidden relative">

      {/* 🌌 Ambient Background Glow & Patterns */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        {/* Geometric Grid Pattern */}
        <div className="absolute inset-0 bg-[radial-gradient(#1e1e1e_1px,transparent_1px)] [background-size:40px_40px] opacity-[0.15]"></div>

        {/* Dynamic Blobs */}
        <div className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] bg-indigo-500/10 blur-[120px] rounded-full animate-pulse"></div>
        <div className="absolute top-[20%] right-[-10%] w-[40vw] h-[40vw] bg-purple-500/10 blur-[100px] rounded-full animate-pulse delay-700"></div>
        <div className="absolute bottom-[-10%] left-[10%] w-[45vw] h-[45vw] bg-blue-500/10 blur-[120px] rounded-full animate-pulse delay-1000"></div>
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

      {/* Create Empty Deck Modal */}
      {showCreateEmptyDeckModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-neutral-900 w-full max-w-sm rounded-2xl p-6 shadow-2xl border border-neutral-800">
            <h3 className="text-xl font-bold mb-4">新規単語帳作成</h3>
            <input
              type="text"
              className="w-full px-4 py-2 mb-4 rounded-lg bg-neutral-800 border-none focus:ring-2 focus:ring-indigo-500 outline-none"
              placeholder="単語帳名 (例: TOEIC 800)"
              value={newEmptyDeckTitle}
              onChange={(e) => setNewEmptyDeckTitle(e.target.value)}
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowCreateEmptyDeckModal(false)}
                className="px-4 py-2 rounded-lg text-sm font-bold text-neutral-500 hover:bg-neutral-800 transition-colors"
              >
                キャンセル
              </button>
              <button
                onClick={handleCreateEmptyDeck}
                className="px-4 py-2 rounded-lg text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-50"
                disabled={!newEmptyDeckTitle.trim() || isCreatingEmptyDeck}
              >
                {isCreatingEmptyDeck ? "作成中..." : "作成"}
              </button>
            </div>
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
                className="px-4 py-2 rounded-lg text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-50"
                disabled={!newFolderName.trim() || isCreatingFolder}
              >
                {isCreatingFolder ? "作成中..." : "作成"}
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
                    <span className="text-emerald-500 font-bold">✓</span> <span className="text-white font-bold">ライティング機能</span> が利用可能
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
                    <span className="text-indigo-500 font-bold text-lg">✓</span> <span className="text-white font-bold">ライティング & ディクテーション</span> 機能
                  </li>
                  <li className="flex items-center gap-3 text-neutral-300 font-bold text-indigo-300">
                    <span className="text-indigo-500 font-bold text-lg">✓</span> 全機能へのフルアクセス・AI優先処理
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

            <p className="text-[10px] text-neutral-500 font-bold text-center mb-4 leading-relaxed max-w-sm mx-auto">
              ※AIを使用しているため、誤った情報や不具合が生じる可能性があることをご了承ください。
            </p>
            <button
              onClick={() => setShowSubscriptionModal(false)}
              className="w-full py-2 text-neutral-500 hover:text-white font-bold transition-colors text-sm"
            >
              戻る
            </button>
          </div>
        </div>
      )}

      <main className="w-full max-w-7xl mx-auto flex flex-col gap-8 px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
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
          <div className={`flex flex-col gap-8 ${showSaved ? 'hidden' : 'pt-4 sm:pt-8'}`}>
            {/* 💎 Personalized Dashboard Header (Glassmorphism) */}
            <div className="relative overflow-hidden p-6 md:p-10 rounded-3xl sm:rounded-[2.5rem] bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] shadow-2xl transition-all hover:bg-white/[0.05] hover:border-white/[0.12]">
              {/* Internal Glows */}
              <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 blur-3xl -translate-y-1/2 translate-x-1/2 rounded-full"></div>
              <div className="absolute bottom-0 left-0 w-32 h-32 bg-purple-500/10 blur-3xl translate-y-1/2 -translate-x-1/2 rounded-full"></div>

              <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6 md:gap-12">
                <div className="flex flex-col">
                  <span className="text-lg sm:text-xl font-bold text-neutral-400 mb-1" style={{ fontFamily: 'var(--font-merriweather)' }}>
                    Welcome back,
                  </span>
                  <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-tight">
                    <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-purple-400">
                      {session?.user?.name?.split(' ')[0] || 'Learner'}!
                    </span>
                  </h1>
                </div>

                <div className="w-full md:max-w-[400px]">
                  {/* Level Stats - Compact on Desktop */}
                  <Link href="/profile" className="w-full px-5 py-5 rounded-[2rem] bg-white/[0.05] border border-white/10 flex items-center gap-5 transition-all hover:bg-white/[0.08] group shadow-xl">
                    <div className="text-3xl sm:text-4xl group-hover:scale-110 transition-transform bg-indigo-500/20 w-14 h-14 rounded-2xl flex items-center justify-center">⭐</div>
                    <div className="flex flex-col flex-1">
                      <div className="flex justify-between items-baseline mb-3">
                        <span className="text-xl font-black text-indigo-400 tracking-tight leading-none">Level {getLevelInfo(xp).level}</span>
                        <span className="text-[10px] text-neutral-500 font-bold uppercase tracking-wider leading-none">{getLevelInfo(xp).xpInCurrentLevel} / {getLevelInfo(xp).xpRequiredForNext} XP</span>
                      </div>
                      <div className="w-full h-2.5 bg-neutral-800/50 rounded-full overflow-hidden shadow-inner p-[1px]">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${getLevelInfo(xp).progress}%` }}
                          transition={{ duration: 1, ease: "easeOut" }}
                          className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-indigo-400 to-purple-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]"
                        />
                      </div>
                    </div>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        )
        }

        {
          session && (
            <>
              {showSaved ? (
                <div className="py-4 animate-in fade-in slide-in-from-top-4">
                  <div className="flex items-center justify-between mb-6 px-2">
                    <h2 className="text-xl font-bold flex items-center gap-2" style={{ fontFamily: 'var(--font-merriweather)' }}>
                      保存した単語帳
                    </h2>
                    <div className="flex items-center gap-5 mr-2">
                      <div className="flex flex-col items-center gap-1.5">
                        <button
                          onClick={() => setIsEditMode(!isEditMode)}
                          className={`w-[46px] h-[46px] rounded-full flex items-center justify-center transition-all ${isEditMode ? 'bg-[#00A896] text-white shadow-[0_0_15px_rgba(0,168,150,0.6)]' : 'bg-[#00A896] text-white hover:opacity-80'}`}
                          title={isEditMode ? "完了" : "並び替え"}
                        >
                          {isEditMode ? (
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12"></polyline>
                            </svg>
                          ) : (
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <line x1="8" y1="6" x2="21" y2="6"></line>
                              <line x1="8" y1="12" x2="21" y2="12"></line>
                              <line x1="8" y1="18" x2="21" y2="18"></line>
                              <line x1="3" y1="6" x2="3.01" y2="6"></line>
                              <line x1="3" y1="12" x2="3.01" y2="12"></line>
                              <line x1="3" y1="18" x2="3.01" y2="18"></line>
                            </svg>
                          )}
                        </button>
                        <span className="text-[11px] text-neutral-400 font-bold tracking-wider">{isEditMode ? "完了" : "並び替え"}</span>
                      </div>

                      <div className="relative flex flex-col items-center gap-1.5">
                        <button
                          onClick={() => setShowCreateMenu(!showCreateMenu)}
                          className="w-[46px] h-[46px] bg-[#00A896] text-white rounded-full flex items-center justify-center hover:opacity-80 transition-all"
                          title="新規作成"
                        >
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M20 6h-8l-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-2 8h-3v3h-2v-3h-3v-2h3V9h2v3h3v2z" />
                          </svg>
                        </button>
                        <span className="text-[11px] text-neutral-400 font-bold tracking-wider">新規作成</span>

                        {showCreateMenu && (
                          <>
                            <div
                              className="fixed inset-0 z-40"
                              onClick={() => setShowCreateMenu(false)}
                            ></div>
                            <div className="absolute right-0 mt-2 w-48 bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2">
                              <button
                                onClick={() => {
                                  setShowCreateMenu(false);
                                  setShowCreateFolderModal(true);
                                }}
                                className="w-full text-left px-4 py-3 text-sm font-bold text-neutral-200 hover:bg-neutral-800 transition-colors flex items-center gap-3 border-b border-neutral-800"
                              >
                                <span className="text-xl">📁</span> フォルダ作成
                              </button>
                              <button
                                onClick={() => {
                                  setShowCreateMenu(false);
                                  setShowCreateEmptyDeckModal(true);
                                }}
                                className="w-full text-left px-4 py-3 text-sm font-bold text-neutral-200 hover:bg-neutral-800 transition-colors flex items-center gap-3"
                              >
                                <span className="text-xl">📝</span> 空の単語帳を作成
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </div >
                  </div >

                  {
                    savedDecks.length === 0 && folders.length === 0 ? (
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
                        <div className="flex flex-col gap-4">
                          {/* Folders Section */}
                          {folders.length > 0 && (
                            <SortableContext items={folders.map(f => f.id)} strategy={rectSortingStrategy}>
                              {folders.map(folder => (
                                <SortableFolderItem
                                  key={folder.id}
                                  folder={folder}
                                  folderDecks={savedDecks.filter(d => d.folderId === folder.id)}
                                  isExpanded={expandedFolderIds.has(folder.id)}
                                  toggleFolder={toggleFolder}
                                  deleteFolder={handleDeleteFolder}
                                  startRenameFolder={startRenameFolder}
                                  saveRenameFolder={saveRenameFolder}
                                  onDeckClick={handleDeckClick}
                                  isEditMode={isEditMode}
                                  onDeleteDeck={handleDeleteDeck}
                                  saveRenameDeck={saveRenameDeck}
                                  dragHandler
                                />
                              ))}
                            </SortableContext>
                          )}

                          {/* Root Decks Section */}
                          <RootDropArea>
                            <SortableContext
                              items={savedDecks.filter(d => !d.folderId).map(d => d.id)}
                              strategy={rectSortingStrategy}
                            >
                              {savedDecks.filter(d => !d.folderId).length === 0 && (
                                <div className="col-span-full flex flex-col items-center justify-center p-8 text-neutral-400 border-2 border-dashed border-neutral-800 rounded-2xl">
                                  <span className="text-4xl mb-2">📥</span>
                                  <p className="text-sm">ここに単語帳をドロップしてフォルダから出す</p>
                                </div>
                              )}
                              {savedDecks.filter(d => !d.folderId).map(deck => (
                                <SortableDeckItem
                                  key={deck.id}
                                  deck={deck}
                                  onClick={handleDeckClick}
                                  isEditMode={isEditMode}
                                  onDelete={handleDeleteDeck}
                                  saveRenameDeck={saveRenameDeck}
                                />
                              ))}
                            </SortableContext>
                          </RootDropArea>
                        </div>

                        <DragOverlay dropAnimation={{
                          sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: '0.5' } } })
                        }}>
                          {activeId ? (
                            <div className="p-4 bg-neutral-800 rounded-xl shadow-2xl border border-indigo-500 opacity-80 w-[300px]">
                              <h3 className="font-bold">
                                {savedDecks.find((d) => d.id === activeId)?.title ||
                                  folders.find((f) => f.id === activeId)?.name}
                              </h3>
                            </div>
                          ) : null}
                        </DragOverlay>
                      </DndContext>
                    )
                  }
                </div >
              ) : (
                <div className="w-full grid lg:grid-cols-[400px_1fr] gap-8 items-start">
                  {/* Left: Input */}
                  <div className="flex flex-col gap-8 sticky top-8">
                    {/* Input Form Card */}
                    <div className="bg-neutral-900 p-6 sm:p-8 rounded-3xl sm:rounded-[2rem] border border-neutral-800 shadow-2xl relative overflow-hidden group">
                      <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                      <div className="relative z-10">
                        <div className="mb-6">
                          <label className="block text-xs font-bold text-neutral-400 uppercase tracking-widest mb-3 px-1">
                            テキストから単語帳を作成
                          </label>
                          <textarea
                            className="w-full h-[240px] sm:h-[280px] p-5 text-base bg-black/60 border border-neutral-800 rounded-2xl sm:rounded-3xl focus:outline-none focus:ring-4 focus:ring-indigo-500/20 resize-none font-mono leading-relaxed overflow-x-auto text-neutral-100 placeholder:text-neutral-700 transition-all"
                            wrap="off"
                            placeholder={"apple\ntake off\nclimate change"}
                            value={wordInput}
                            onChange={(e) => setWordInput(e.target.value)}
                          />
                        </div>

                        <button
                          onClick={handleGenerate}
                          disabled={loading || !wordInput.trim()}
                          className={`w-full py-4 sm:py-5 rounded-xl sm:rounded-2xl font-black text-xs sm:text-sm tracking-widest uppercase transition-all relative overflow-hidden group
                            ${loading
                              ? "bg-neutral-800 text-neutral-600 cursor-not-allowed"
                              : "bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-xl shadow-indigo-600/30 hover:shadow-indigo-600/50 hover:scale-[1.02] active:scale-[0.98]"
                            }
                          `}
                        >
                          <span className="relative z-10 flex items-center justify-center gap-3">
                            {loading ? (
                              <>
                                <svg className="animate-spin h-5 w-5 text-neutral-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                作成中...
                              </>
                            ) : (
                              <>
                                <span className="text-xl">✨</span> 単語帳を作成
                              </>
                            )}
                          </span>
                          {!loading && (
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-in-out"></div>
                          )}
                        </button>
                        <p className="mt-4 text-[10px] text-neutral-500 text-center font-bold tracking-tight">
                          ※ Up to 50 items per generation
                        </p>
                        {error && <p className="mt-3 text-xs text-red-400 text-center font-bold">{error}</p>}
                      </div>
                    </div>
                  </div>

                  {/* Right: Output List / Dashboard */}
                  <div className="h-full">
                    {words.length === 0 ? (
                      <div className="flex flex-col gap-8 animate-in fade-in duration-700">
                        {/* 📊 Dashboard Widgets Grid */}
                        {mounted && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">

                            {/* 1. Daily Quiz Widget */}
                            <div
                              className="bg-gradient-to-br from-indigo-600/10 to-purple-600/10 border border-indigo-500/20 rounded-3xl sm:rounded-[2.5rem] p-6 sm:p-8 shadow-xl relative group cursor-pointer hover:border-indigo-500/40 transition-all sm:col-span-2"
                              onClick={() => router.push('/decks/daily-10')}
                            >
                              <div className="absolute top-0 right-0 p-4 sm:p-6 opacity-10">
                                <svg width="40" height="40" className="sm:w-[60px] sm:h-[60px]" viewBox="0 0 24 24" fill="currentColor"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" /></svg>
                              </div>
                              <div className="relative z-10 flex flex-col h-full pr-16 sm:pr-24">
                                <div className="flex justify-between items-start mb-4">
                                  <h3 className="text-xs font-black text-indigo-400 uppercase tracking-widest">本日の10問</h3>
                                  <span className="text-[10px] font-bold text-indigo-300 bg-indigo-500/10 px-2 py-0.5 rounded-full">毎日更新</span>
                                </div>
                                <div className="mb-6 sm:mb-8">
                                  <span className="text-2xl sm:text-3xl font-black text-white block mb-2">
                                    今日の実力試し
                                  </span>
                                  <span className="text-xs sm:text-sm font-medium text-neutral-400">
                                    保存した単語から10問をランダムに出題します
                                  </span>
                                </div>
                                <div className="mt-auto flex items-center gap-4 text-[10px] sm:text-xs font-bold text-neutral-500 uppercase tracking-widest whitespace-nowrap">
                                  <span className="flex items-center gap-1.5"><span className="text-indigo-400">{dailyStudyCount}</span> 回学習</span>
                                  <div className="w-1 h-1 rounded-full bg-neutral-800"></div>
                                  <span>最終: {dailyLastStudiedAt ? (() => {
                                    const lastDate = new Date(dailyLastStudiedAt);
                                    const now = new Date();
                                    const lastDateDay = new Date(lastDate.getFullYear(), lastDate.getMonth(), lastDate.getDate());
                                    const nowDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                                    const diffTime = nowDay.getTime() - lastDateDay.getTime();
                                    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                                    if (diffDays === 0) return "今日";
                                    if (diffDays === 1) return "昨日";
                                    return `${diffDays}日前`;
                                  })() : "未学習"}</span>
                                </div>
                              </div>
                              <div className="absolute right-6 sm:right-10 top-1/2 -translate-y-1/2 w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-indigo-600 flex items-center justify-center text-white shadow-xl group-hover:scale-110 group-hover:bg-indigo-500 transition-all z-20">
                                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                              </div>
                            </div>

                            {/* 2. Resume Study Card */}
                            {savedDecks.length > 0 && (() => {
                              const latestDeck = [...savedDecks].sort((a, b) => {
                                if (!a.last_studied_at) return 1;
                                if (!b.last_studied_at) return -1;
                                return new Date(b.last_studied_at).getTime() - new Date(a.last_studied_at).getTime();
                              })[0];
                              if (!latestDeck.last_studied_at) return null;

                              return (
                                <div className="group relative overflow-hidden bg-neutral-900 border border-neutral-800 rounded-3xl p-6 sm:p-8 transition-all hover:border-indigo-500/50 cursor-pointer shadow-xl sm:col-span-2" onClick={() => handleDeckClick(latestDeck.id)}>
                                  <div className="absolute top-0 right-0 p-4 sm:p-6 text-indigo-500/20 group-hover:text-indigo-500/40 transition-colors">
                                    <Layers className="w-10 h-10 sm:w-16 sm:h-16" />
                                  </div>
                                  <div className="relative z-10 flex flex-col h-full pr-16 sm:pr-24">
                                    <div className="flex justify-between items-start mb-4">
                                      <h3 className="text-xs font-black text-indigo-400 uppercase tracking-widest">直近に学習した単語帳</h3>
                                    </div>
                                    <div className="mb-6 sm:mb-8">
                                      <span className="text-2xl sm:text-3xl font-black text-white truncate block mb-2">{latestDeck.title}</span>
                                      <span className="text-xs sm:text-sm font-medium text-neutral-400">
                                        最後に学習した単語帳から再開します
                                      </span>
                                    </div>
                                    <div className="mt-auto flex items-center gap-4 text-xs font-bold text-neutral-500 uppercase tracking-widest whitespace-nowrap">
                                      <span className="flex items-center gap-1.5"><span className="text-indigo-400">{latestDeck.study_count || 0}</span> 回学習</span>
                                      <div className="w-1 h-1 rounded-full bg-neutral-800"></div>
                                      <span>最終: {latestDeck.last_studied_at ? (() => {
                                        const lastDate = new Date(latestDeck.last_studied_at);
                                        const now = new Date();
                                        const lastDateDay = new Date(lastDate.getFullYear(), lastDate.getMonth(), lastDate.getDate());
                                        const nowDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                                        const diffTime = nowDay.getTime() - lastDateDay.getTime();
                                        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                                        if (diffDays === 0) return "今日";
                                        if (diffDays === 1) return "昨日";
                                        return `${diffDays}日前`;
                                      })() : "未学習"}</span>
                                    </div>
                                  </div>
                                  <div className="absolute right-6 sm:right-10 top-1/2 -translate-y-1/2 w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-indigo-600 flex items-center justify-center text-white shadow-xl group-hover:scale-110 group-hover:bg-indigo-500 transition-all z-20">
                                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="w-full flex flex-col gap-6 animate-in slide-in-from-bottom-4 duration-500">
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
                              <button onClick={() => handleRemoveWord(idx)} className="absolute top-3 right-4 text-neutral-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all z-10">✕</button>

                              <div className="flex items-baseline gap-4 mb-3 pr-12">
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



                              <div className="absolute top-3 right-4 text-xs text-neutral-400 font-mono select-none group-hover:text-transparent">
                                #{idx + 1}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )
              }
            </>
          )
        }


        {/* Admin Link */}
        {(session?.user as any)?.role === 'admin' && (
          <div className="flex justify-center mt-8 pb-8">
            <Link
              href="/sys-ctrl-99"
              className="text-[10px] text-neutral-600 hover:text-indigo-400 font-bold transition-colors px-3 py-1.5 rounded-full border border-neutral-800 hover:border-indigo-500/30"
            >
              管理者ダッシュボード
            </Link>
          </div>
        )}
      </main >
    </div >
  );
}


// --- Sortable Components ---
function SortableDeckItem({ deck, onClick, isEditMode, onDelete, saveRenameDeck }: { deck: Deck; onClick: (id: string) => void; isEditMode?: boolean; onDelete?: (id: string, e: any) => void; saveRenameDeck?: (id: string, title: string) => void; }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: deck.id });

  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(deck.title);
  const [showMenu, setShowMenu] = useState(false);

  useEffect(() => setTitle(deck.title), [deck.title]);

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
      className={`group relative p-4 flex items-center justify-between rounded-2xl border transition-all 
        ${showMenu ? 'z-50' : ''}
        ${isDragging ? 'shadow-2xl ring-2 ring-indigo-500 z-50 bg-neutral-800 border-indigo-500' : 'bg-neutral-800/80 border-neutral-700/50 hover:bg-neutral-800 hover:border-neutral-600 shadow-sm'}
      `}
      onClick={(e) => {
        if (!isDragging && !isEditMode && !isEditing && !showMenu) onClick(deck.id);
      }}
    >
      <div className="flex items-center gap-4 flex-1 min-w-0 pr-4">
        {/* Left Icon (Folder representation) */}
        <div className="w-12 h-12 bg-sky-500/20 rounded-xl flex items-center justify-center shrink-0">
          <Layers className="w-6 h-6 text-sky-400" />
        </div>

        {/* Center Content */}
        <div className="flex flex-col gap-1 w-full min-w-0">
          {isEditing ? (
            <div className="flex gap-2 items-center overflow-x-auto max-w-[50vw] sm:max-w-none py-1 no-scrollbar" onClick={e => e.stopPropagation()}>
              <input
                autoFocus
                value={title}
                onChange={e => setTitle(e.target.value)}
                className="px-2 py-1 rounded bg-black border border-indigo-500 outline-none text-sm min-w-[120px]"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    saveRenameDeck?.(deck.id, title);
                    setIsEditing(false);
                  }
                }}
              />
              <button type="button" onClick={() => { saveRenameDeck?.(deck.id, title); setIsEditing(false); }} className="text-xs font-bold text-green-500 bg-green-500/10 px-3 py-1.5 rounded whitespace-nowrap">保存</button>
              <button type="button" onClick={() => { setIsEditing(false); setTitle(deck.title); }} className="text-xs font-bold text-neutral-500 bg-neutral-500/10 px-3 py-1.5 rounded whitespace-nowrap">戻る</button>
            </div>
          ) : (
            <div className="flex items-center gap-2 group/title" onClick={(e) => e.stopPropagation()}>
              <h3 className="font-bold text-base text-neutral-100 truncate w-full group-hover/title:text-indigo-300 transition-colors" onClick={() => { if (!isEditMode && !isDragging) onClick(deck.id); }}>
                {deck.title}
              </h3>
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center gap-y-1 sm:gap-x-4 mt-1.5">
            <div className="flex items-center gap-1.5 text-neutral-400 shrink-0">
              <span className="text-[11px] font-bold">{deck.words.length} <span className="font-normal opacity-70">words</span></span>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-y-1 sm:gap-x-3">
              <div className="flex items-center gap-1.5 text-neutral-500 font-bold text-[10px] whitespace-nowrap">
                <span className="w-4 text-center">🔥</span> 学習回数: {deck.study_count ?? 0}回
              </div>
              <div className="flex items-center gap-1.5 text-neutral-500/80 font-bold text-[10px] whitespace-nowrap">
                <span className="w-4 text-center">📅</span> 最終学習: {deck.last_studied_at ? (() => {
                  const lastDate = new Date(deck.last_studied_at);
                  const now = new Date();
                  const lastDateDay = new Date(lastDate.getFullYear(), lastDate.getMonth(), lastDate.getDate());
                  const nowDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                  const diffTime = nowDay.getTime() - lastDateDay.getTime();
                  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                  if (diffDays === 0) return "今日";
                  if (diffDays === 1) return "昨日";
                  return `${diffDays}日前`;
                })() : "未学習"}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Content */}
      <div className="relative flex flex-col items-center justify-center gap-2 shrink-0 h-full">
        {isEditMode ? (
          <>
            {/* Drag Handle */}
            <div
              ref={setActivatorNodeRef}
              {...attributes}
              {...listeners}
              className="cursor-grab active:cursor-grabbing text-neutral-500 hover:text-white p-2 touch-none opacity-100 transition-opacity"
              onClick={(e) => e.stopPropagation()}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="5" r="1.5" /><circle cx="9" cy="12" r="1.5" /><circle cx="9" cy="19" r="1.5" /><circle cx="15" cy="5" r="1.5" /><circle cx="15" cy="12" r="1.5" /><circle cx="15" cy="19" r="1.5" /></svg>
            </div>
          </>
        ) : (
          !isEditing && (
            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMenu(!showMenu);
                }}
                className="p-2 text-neutral-500 hover:text-white rounded-full hover:bg-neutral-800 transition-colors"
                title="メニュー"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle><circle cx="5" cy="12" r="1"></circle></svg>
              </button>

              {showMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setShowMenu(false); }}></div>
                  <div className="absolute right-0 top-10 w-40 bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowMenu(false);
                        setIsEditing(true);
                        setTitle(deck.title);
                      }}
                      className="w-full text-left px-4 py-3 text-sm font-bold text-neutral-200 hover:bg-neutral-800 transition-colors border-b border-neutral-800 whitespace-nowrap"
                    >
                      名前の変更
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowMenu(false);
                        if (onDelete) onDelete(deck.id, e);
                      }}
                      className="w-full text-left px-4 py-3 text-sm font-bold text-red-500 hover:bg-neutral-800 transition-colors whitespace-nowrap"
                    >
                      この単語帳を削除
                    </button>
                  </div>
                </>
              )}
            </div>
          )
        )}
      </div>
    </div>
  );
}

// --- Folder Component with Sortable ---

function EmptyFolderDropArea({ folderId }: { folderId: string }) {
  const { setNodeRef, isOver } = useDroppable({ id: `${folderId}-empty-drop`, data: { type: 'EmptyFolder' } });

  return (
    <div
      ref={setNodeRef}
      className={`col-span-full text-center text-sm py-8 border-2 border-dashed rounded-xl transition-all
        ${isOver ? 'border-indigo-400 text-indigo-300 bg-indigo-500/10' : 'border-neutral-800/50 text-neutral-500 hover:text-neutral-400'}
      `}
    >
      <span className="block text-2xl mb-2">📥</span>
      ここに単語帳をドロップして追加
    </div>
  );
}

function SortableFolderItem(props: any) {
  const {
    attributes,
    listeners,
    setNodeRef: setSortableNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
  } = useSortable({ id: props.folder.id, data: { type: 'Folder' } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 999 : undefined,
  };

  return (
    <div ref={setSortableNodeRef} style={style}>
      <FolderRow
        {...props}
        isDragging={isDragging}
        isOver={isOver}
        dragListeners={listeners}
        dragAttributes={attributes}
        setActivatorNodeRef={setActivatorNodeRef}
      />
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
  saveRenameFolder,
  isEditMode,
  onDeleteDeck,
  saveRenameDeck,
  isDragging,
  isOver,
  dragListeners,
  dragAttributes,
  setActivatorNodeRef
}: {
  folder: Folder;
  folderDecks: Deck[];
  isExpanded: boolean;
  toggleFolder: (id: string) => void;
  deleteFolder: (id: string, e: any) => void;
  onDeckClick: (id: string) => void;
  startRenameFolder: (id: string, name: string) => void;
  saveRenameFolder: (id: string, name: string) => void;
  isEditMode?: boolean;
  onDeleteDeck?: (id: string, e: any) => void;
  saveRenameDeck?: (id: string, title: string) => void;
  isDragging?: boolean;
  isOver?: boolean;
  dragListeners?: any;
  dragAttributes?: any;
  setActivatorNodeRef?: any;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(folder.name);
  const [showMenu, setShowMenu] = useState(false);

  useEffect(() => setName(folder.name), [folder.name]);

  return (
    <div
      className={`rounded-2xl border transition-all duration-200
          ${showMenu ? 'z-50 relative' : ''}
          ${isOver
          ? 'bg-indigo-900/40 border-indigo-500 scale-[1.02] shadow-xl'
          : isDragging ? 'bg-neutral-800 shadow-2xl ring-2 ring-indigo-500 border-indigo-500 z-50 relative' : 'bg-neutral-800/50 border-neutral-700/50 hover:bg-neutral-800'
        }
      `}
    >
      <div
        className="p-4 flex items-center justify-between cursor-pointer group"
        onClick={() => { if (!isDragging && !isEditing && !showMenu) toggleFolder(folder.id); }}
      >
        <div className="flex items-center gap-4 flex-1 min-w-0 pr-4">
          {/* Left Icon (Folder representation) */}
          <div className="w-12 h-12 bg-indigo-500/20 rounded-xl flex items-center justify-center shrink-0">
            <Folder className="w-6 h-6 text-indigo-400 fill-indigo-400/20" />
          </div>

          <div className="flex flex-col gap-1 w-full min-w-0">
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
                <button onClick={() => { saveRenameFolder(folder.id, name); setIsEditing(false); }} className="text-xs font-bold text-green-500 bg-green-500/10 px-3 py-1.5 rounded whitespace-nowrap">保存</button>
                <button onClick={() => { setIsEditing(false); setName(folder.name); }} className="text-xs font-bold text-neutral-500 bg-neutral-500/10 px-3 py-1.5 rounded whitespace-nowrap">戻る</button>
              </div>
            ) : (
              <div className="flex items-center gap-2 group/title" onClick={(e) => e.stopPropagation()}>
                <h3 className="font-bold text-base text-neutral-100 truncate group-hover/title:text-white transition-colors">
                  {folder.name}
                </h3>
              </div>
            )}

            <div className="flex items-center gap-4 mt-1">
              <div className="flex items-center gap-1.5 text-neutral-400">
                <span className="text-[11px] font-bold">{folderDecks.length} <span className="font-normal opacity-70">decks</span></span>
              </div>
            </div>
          </div>
        </div>

        <div className="relative flex flex-col items-center justify-center gap-2 shrink-0 h-full">
          {isEditMode ? (
            !isExpanded && (
              <div
                ref={setActivatorNodeRef}
                {...dragAttributes}
                {...dragListeners}
                className="cursor-grab active:cursor-grabbing text-neutral-500 hover:text-white p-2 touch-none opacity-100 transition-opacity"
                onClick={(e) => e.stopPropagation()}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="5" r="1.5" /><circle cx="9" cy="12" r="1.5" /><circle cx="9" cy="19" r="1.5" /><circle cx="15" cy="5" r="1.5" /><circle cx="15" cy="12" r="1.5" /><circle cx="15" cy="19" r="1.5" /></svg>
              </div>
            )
          ) : (
            !isEditing && (
              <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowMenu(!showMenu);
                  }}
                  className="p-2 text-neutral-500 hover:text-white rounded-full hover:bg-neutral-800 transition-colors"
                  title="メニュー"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle><circle cx="5" cy="12" r="1"></circle></svg>
                </button>

                {showMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setShowMenu(false); }}></div>
                    <div className="absolute right-0 top-10 w-40 bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowMenu(false);
                          setIsEditing(true);
                          setName(folder.name);
                        }}
                        className="w-full text-left px-4 py-3 text-sm font-bold text-neutral-200 hover:bg-neutral-800 transition-colors border-b border-neutral-800 whitespace-nowrap"
                      >
                        名前の変更
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowMenu(false);
                          if (deleteFolder) deleteFolder(folder.id, e);
                        }}
                        className="w-full text-left px-4 py-3 text-sm font-bold text-red-500 hover:bg-neutral-800 transition-colors whitespace-nowrap"
                      >
                        フォルダを削除
                      </button>
                    </div>
                  </>
                )}

                <span className={`text-neutral-600 transition-all p-1.5 ${isExpanded ? 'rotate-90' : ''}`}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" >
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                </span>
              </div>
            )
          )}
        </div>
      </div>

      {
        isExpanded && (
          <div className="p-4 pt-0 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-in slide-in-from-top-2">
            <SortableContext items={folderDecks.map(d => d.id)} strategy={rectSortingStrategy}>
              {folderDecks.length === 0 && <EmptyFolderDropArea folderId={folder.id} />}
              {folderDecks.map((deck) => (
                <SortableDeckItem key={deck.id} deck={deck} onClick={onDeckClick} isEditMode={isEditMode} onDelete={onDeleteDeck} saveRenameDeck={saveRenameDeck} />
              ))}
            </SortableContext>
          </div>
        )
      }
    </div >
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
