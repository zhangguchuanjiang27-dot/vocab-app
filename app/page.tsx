"use client";

import { useState, useEffect } from "react";
import { signOut, useSession, signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

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
  createdAt: string;
  words: WordCard[];
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
  const [input, setInput] = useState("");
  const [words, setWords] = useState<WordCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // 保存・一覧用ステート
  const [deckTitle, setDeckTitle] = useState("");
  const [editingDeckId, setEditingDeckId] = useState<string | null>(null);
  const [editDeckTitle, setEditDeckTitle] = useState("");
  const [showAddToDeckModal, setShowAddToDeckModal] = useState(false);
  const [savedDecks, setSavedDecks] = useState<Deck[]>([]);
  const [showSaved, setShowSaved] = useState(false);

  // 詳細表示と音声用
  const [expandedWordIndex, setExpandedWordIndex] = useState<number | null>(null);

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
      fetchCredits();
    } else {
      setSavedDecks([]);
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

  const [credits, setCredits] = useState<number | null>(null);
  const [xp, setXp] = useState<number>(0);
  const [badges, setBadges] = useState<any[]>([]);
  const [showLevelUp, setShowLevelUp] = useState(false);
  const [prevLevel, setPrevLevel] = useState<number | null>(null);

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
        setXp(newXp);
        setBadges(data.badges || []);
        setPrevLevel(newLevel);
      }
    } catch (e) {
      console.error("Failed to fetch credits", e);
    }
  };

  const handlePurchase = async () => {
    try {
      const res = await fetch("/api/checkout", { method: "POST" });
      if (!res.ok) throw new Error("Checkout failed");
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (e) {
      console.error("Purchase error:", e);
      alert("決済ページへの移動に失敗しました");
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

  // デッキタイトル変更処理
  const handleRenameDeck = async (id: string) => {
    if (!editDeckTitle.trim()) return;

    try {
      const res = await fetch(`/api/decks/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: editDeckTitle }),
      });

      if (res.ok) {
        setSavedDecks(prev => prev.map(d => d.id === id ? { ...d, title: editDeckTitle } : d));
        setEditingDeckId(null);
      } else {
        alert("タイトルの変更に失敗しました");
      }
    } catch (e) {
      console.error(e);
      alert("エラーが発生しました");
    }
  };

  // 単語帳クリック時の処理（詳細ページへ遷移）
  const handleDeckClick = (deckId: string) => {
    router.push(`/decks/${deckId}`);
  };

  const handleGenerate = async () => {
    if (!input.trim()) return;

    // 行数チェック（50行制限）
    const lineCount = input.split("\n").filter(line => line.trim() !== "").length;
    if (lineCount > 50) {
      alert(`一度に生成できる単語数は最大50個までです。\n現在の入力: ${lineCount}個\n\n品質を保つため、50個以下に分割して入力してください。`);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/ai-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: input }),
      });

      if (!response.ok) throw new Error("Failed to generate vocabulary");

      const data = await response.json();
      if (data.words) {
        // 既存のリストに追加（追記モード）
        setWords((prev) => [...prev, ...data.words]);
        setInput("");

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
    if (!confirm(`単語帳 "${deckTitle}" に現在の ${words.length} 語を追加しますか？`)) return;

    try {
      const res = await fetch(`/api/decks/${deckId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ words }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Server Error");
      }

      alert(`"${deckTitle}" に追加しました！`);
      setShowAddToDeckModal(false);
      setWords([]); // 追加後はクリア
      fetchDecks(); // 一覧更新
    } catch (e: any) {
      console.error(e);
      alert(`追加に失敗しました: ${e.message}`);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 p-6 sm:p-12 font-sans transition-colors duration-300">

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

      {/* Add To Deck Modal */}
      {showAddToDeckModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-neutral-900 w-full max-w-md rounded-2xl p-6 shadow-2xl border border-neutral-200 dark:border-neutral-800">
            <h3 className="text-xl font-bold mb-4">どの単語帳に追加しますか？</h3>
            <div className="max-h-[60vh] overflow-y-auto flex flex-col gap-2 mb-4">
              {savedDecks.length === 0 ? (
                <p className="text-neutral-500 text-center py-4">保存された単語帳がありません</p>
              ) : (
                savedDecks.map((deck) => (
                  <button
                    key={deck.id}
                    onClick={() => handleAddToExistingDeck(deck.id, deck.title)}
                    className="flex justify-between items-center p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors text-left group"
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
              className="w-full py-3 rounded-xl bg-neutral-200 dark:bg-neutral-800 font-bold text-sm hover:opacity-80 transition-opacity"
            >
              キャンセル
            </button>
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto flex flex-col gap-8">
        {!session ? (
          <div className="text-center py-24 px-6 animate-in fade-in zoom-in duration-500">
            <h1 className="text-5xl sm:text-7xl font-black mb-8 tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-neutral-900 via-neutral-600 to-neutral-900 dark:from-white dark:via-neutral-400 dark:to-white">
              Voca
            </h1>
            <p className="text-xl text-neutral-500 max-w-2xl mx-auto mb-12 leading-relaxed">
              AIが生成するフラッシュカードで、試験も日常会話も完璧に。<br className="hidden sm:block" />
              あなたの入力から、意味・例文・音声を一瞬で作成します。
            </p>
            <button
              onClick={() => signIn("google")}
              className="px-8 py-4 bg-indigo-600 text-white rounded-full font-bold text-lg hover:bg-indigo-700 hover:shadow-xl hover:shadow-indigo-500/30 transition-all active:scale-95 flex items-center gap-2 mx-auto"
            >
              <span>✨</span> 今すぐ始める (ログイン)
            </button>
          </div>
        ) : (
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center pt-4 gap-4">

            {/* Gamification Stats */}
            <div className="flex flex-col gap-2">
              <Link href="/profile" className="block group">
                <div className="flex items-center gap-6 bg-white dark:bg-neutral-900 px-6 py-3 rounded-full border border-neutral-200 dark:border-neutral-800 shadow-sm group-hover:border-indigo-300 transition-colors cursor-pointer">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <span className="text-2xl">🔥</span>
                      <div className="absolute -top-1 -right-1 bg-indigo-500 text-white text-[8px] font-black w-4 h-4 rounded-full flex items-center justify-center border border-white dark:border-neutral-900">
                        {getLevelInfo(xp).level}
                      </div>
                    </div>
                    <div className="flex flex-col min-w-[140px]">
                      <div className="flex justify-between items-end mb-1.5">
                        <div className="flex items-baseline gap-1">
                          <span className="text-[10px] text-neutral-400 font-bold uppercase tracking-tighter">Lv.</span>
                          <span className="text-sm font-black text-neutral-900 dark:text-white leading-none">{getLevelInfo(xp).level}</span>
                        </div>
                        <p className="text-[10px] text-indigo-500 font-bold leading-none tracking-tight">
                          {getLevelInfo(xp).xpInCurrentLevel} <span className="text-neutral-300 dark:text-neutral-600 font-normal mx-0.5">/</span> {getLevelInfo(xp).xpRequiredForNext} <span className="text-[8px] opacity-70">XP</span>
                        </p>
                      </div>
                      {/* Progress Bar */}
                      <div className="w-full h-2 bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden shadow-inner">
                        <div
                          className="h-full bg-indigo-500 transition-all duration-1000 ease-out"
                          style={{ width: `${getLevelInfo(xp).progress}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>

                  <div className="w-px h-8 bg-neutral-200 dark:bg-neutral-800 hidden sm:block"></div>

                  <div className="flex items-center gap-2">
                    <span className="text-xl">🪙</span>
                    <div>
                      <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider leading-none">Coins</p>
                      <p className="font-bold text-neutral-900 dark:text-neutral-100">{credits ?? "..."}</p>
                    </div>
                  </div>

                  {badges.length > 0 && (
                    <>
                      <div className="w-px h-8 bg-neutral-200 dark:bg-neutral-800 hidden sm:block"></div>
                      <div className="flex items-center gap-1">
                        {badges.map((b: any) => (
                          <span key={b.id} title={b.badge.displayName} className="text-xl cursor-help hover:scale-125 transition-transform">
                            {b.badge.icon}
                          </span>
                        ))}
                      </div>
                    </>
                  )}

                  {/* Chevron to indicate clickable */}
                  <div className="pl-2 text-neutral-300 group-hover:text-indigo-500 transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                    </svg>
                  </div>
                </div>
              </Link>
            </div>

            <button
              onClick={() => setShowSaved(!showSaved)}
              className={`px-5 py-2.5 rounded-full font-bold text-sm transition-all shadow-sm border ${showSaved ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 hover:border-indigo-300'}`}
            >
              {showSaved ? "閉じる" : "📂 保存した単語帳を開く"}
            </button>
          </div>
        )}

        {session && (
          <>
            {showSaved ? (
              <div className="bg-white dark:bg-neutral-900 rounded-2xl p-8 shadow-sm border border-neutral-200 dark:border-neutral-800 animate-in fade-in slide-in-from-top-4">
                <h2 className="text-2xl font-bold mb-6 flex items-center gap-2" style={{ fontFamily: 'var(--font-merriweather)' }}>
                  保存した単語帳
                </h2>
                {savedDecks.length === 0 ? (
                  <div className="text-center py-12 text-neutral-400">
                    <p>保存された単語帳はありません。</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {savedDecks.map((deck) => (
                      <div
                        key={deck.id}
                        className="group relative p-6 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 hover:shadow-xl hover:border-indigo-400 transition-all cursor-pointer"
                        onClick={() => editingDeckId !== deck.id && handleDeckClick(deck.id)}
                      >
                        {editingDeckId === deck.id ? (
                          <div className="flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
                            <input
                              autoFocus
                              value={editDeckTitle}
                              onChange={(e) => setEditDeckTitle(e.target.value)}
                              className="w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-800 border-2 border-indigo-500 rounded-xl focus:outline-none font-bold"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleRenameDeck(deck.id);
                                if (e.key === 'Escape') setEditingDeckId(null);
                              }}
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleRenameDeck(deck.id)}
                                className="flex-1 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700"
                              >
                                保存
                              </button>
                              <button
                                onClick={() => setEditingDeckId(null)}
                                className="px-3 py-1.5 bg-neutral-200 dark:bg-neutral-800 rounded-lg text-xs font-bold"
                              >
                                キャンセル
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="absolute top-4 right-4 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingDeckId(deck.id);
                                  setEditDeckTitle(deck.title);
                                }}
                                className="p-2 text-neutral-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-full transition-all"
                                title="名前を変更"
                              >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                              </button>
                              <button
                                onClick={(e) => handleDeleteDeck(deck.id, e)}
                                className="p-2 text-neutral-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full transition-all"
                                title="単語帳を削除"
                              >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                              </button>
                            </div>
                            <h3 className="font-bold text-lg mb-2 pr-12 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors leading-tight">{deck.title}</h3>
                            <div className="flex items-center gap-3">
                              <p className="text-xs text-neutral-500 font-mono bg-neutral-100 dark:bg-neutral-800 px-2 py-0.5 rounded shadow-sm">{deck.words.length} 語</p>
                              <p className="text-[10px] text-neutral-400">{new Date(deck.createdAt).toLocaleDateString()}</p>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="grid lg:grid-cols-[320px_1fr] gap-8 items-start">
                {/* Left: Input */}
                <div className="flex flex-col gap-4 sticky top-8">
                  <div className="bg-white dark:bg-neutral-900 p-5 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-sm">
                    <label className="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-3">
                      単語を入力
                    </label>
                    <textarea
                      className="w-full h-[300px] p-3 text-base bg-neutral-50 dark:bg-black border border-neutral-200 dark:border-neutral-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 resize-none mb-4 font-mono leading-relaxed"
                      placeholder={`例：\napple\nrun\ntake off`}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                    />
                    <button
                      onClick={handleGenerate}
                      disabled={loading || !input.trim()}
                      className={`w-full py-3 rounded-lg font-bold text-sm transition-all
                          ${loading ? "bg-neutral-100 text-neutral-400" : "bg-neutral-900 dark:bg-white text-white dark:text-black hover:opacity-90 shadow-md"}
                        `}
                    >
                      {loading ? "生成中..." : "リストを生成"}
                    </button>
                    {error && <p className="mt-2 text-xs text-red-500 text-center">{error}</p>}
                  </div>
                </div>

                {/* Right: Output List */}
                <div className="min-h-[500px]">
                  {words.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center border-2 border-dashed border-neutral-200 dark:border-neutral-800 rounded-2xl text-neutral-400 p-12">
                      <p>左のフォームに単語を入力して生成してください</p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-6">
                      {/* Toolbar */}
                      <div className="bg-white dark:bg-neutral-900 p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-sm flex flex-col sm:flex-row gap-4 items-center justify-between sticky top-8 z-10">
                        <div className="flex items-center gap-3 w-full sm:w-auto flex-1">
                          <button onClick={handleClearList} className="text-xs font-bold text-red-500 hover:bg-red-50 px-3 py-2 rounded-lg transition-colors">クリア</button>
                          <input
                            type="text"
                            value={deckTitle}
                            onChange={(e) => setDeckTitle(e.target.value)}
                            placeholder="単語帳に名前をつける..."
                            className="flex-1 bg-neutral-100 dark:bg-neutral-800 px-4 py-2 rounded-xl font-bold text-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/50 placeholder:font-normal placeholder:text-neutral-400 transition-all border-none"
                          />
                        </div>
                        <div className="flex gap-2 w-full sm:w-auto">
                          <button onClick={() => setShowAddToDeckModal(true)} className="px-4 py-2 text-xs font-bold border border-neutral-200 dark:border-neutral-700 rounded-lg hover:bg-neutral-50 transition-colors">
                            + 既存に追加
                          </button>
                          <button onClick={handleSaveDeck} className="px-6 py-2 text-xs font-bold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-sm">
                            新規保存
                          </button>
                        </div>
                      </div>

                      {/* Words List */}
                      <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-sm overflow-hidden">
                        {words.map((card, idx) => (
                          <div key={idx} className="group relative p-6 border-b border-neutral-100 dark:border-neutral-800 last:border-0 hover:bg-neutral-50/50 transition-colors">
                            <button onClick={() => handleRemoveWord(idx)} className="absolute top-4 right-4 text-neutral-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all">✕</button>

                            <div className="flex items-baseline gap-4 mb-3">
                              <div className="flex items-center gap-2">
                                <span className="text-xl font-bold text-neutral-900 dark:text-neutral-100" style={{ fontFamily: 'var(--font-merriweather)' }}>{card.word}</span>
                                <button
                                  onClick={() => speak(card.word)}
                                  className="p-1.5 text-neutral-300 hover:text-indigo-500 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors shrink-0"
                                  title="Play word"
                                >
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
                                </button>
                              </div>
                              {card.partOfSpeech && (
                                <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-neutral-100 dark:bg-neutral-800 text-neutral-500 rounded-md">
                                  {card.partOfSpeech}
                                </span>
                              )}
                              <span className="text-neutral-600 dark:text-neutral-300 font-medium ml-auto sm:ml-0" style={{ fontFamily: 'var(--font-noto-serif-jp)' }}>{card.meaning}</span>
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
        )}
      </main>

      {/* Hidden Admin Link */}
      {session?.user?.email === "zhangguchuanjiang27@gmail.com" && (
        <div className="max-w-7xl mx-auto mt-12 mb-8 flex justify-center opacity-20 hover:opacity-100 transition-opacity">
          <Link
            href="/admin"
            className="text-[10px] font-bold text-neutral-400 hover:text-indigo-500 uppercase tracking-widest border border-neutral-200 dark:border-neutral-800 px-3 py-1 rounded-full transition-colors"
          >
            ⚙️ System Admin
          </Link>
        </div>
      )}
    </div>
  );
}
