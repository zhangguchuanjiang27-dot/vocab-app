"use client";

import { useState, useEffect } from "react";
import { signOut, useSession, signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

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

  const fetchCredits = async () => {
    try {
      const res = await fetch("/api/user/credits");
      if (res.ok) {
        const data = await res.json();
        setCredits(data.credits);
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

  // 単語帳クリック時の処理（詳細ページへ遷移）
  const handleDeckClick = (deckId: string) => {
    router.push(`/decks/${deckId}`);
  };

  const handleGenerate = async () => {
    if (!input.trim()) return;

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

  // 既存のデッキに追加するためのステート
  const [showAddToDeckModal, setShowAddToDeckModal] = useState(false);

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
        {/* Header */}
        <header className="flex flex-col md:flex-row items-center justify-between gap-4 border-b border-neutral-200 dark:border-neutral-800 pb-6">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-neutral-900 dark:text-white" style={{ fontFamily: 'var(--font-merriweather)' }}>
              Vocab Builder
            </h1>
            <p className="text-neutral-500 text-sm mt-1">AI-Powered Vocabulary Notebook</p>
          </div>

          <div className="flex items-center gap-3">
            {session ? (
              <>
                <div className="bg-neutral-100 dark:bg-neutral-900 px-4 py-2 rounded-full flex items-center gap-2 border border-neutral-200 dark:border-neutral-800">
                  <span className="text-xs font-bold text-neutral-500 uppercase">Credits</span>
                  <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">{credits ?? '-'}</span>
                </div>
                <button
                  onClick={handlePurchase}
                  className="px-4 py-2 rounded-full font-bold text-xs bg-amber-400 text-amber-900 hover:bg-amber-300 transition-colors"
                >
                  + Coins
                </button>
                <button
                  onClick={() => setShowSaved(!showSaved)}
                  className={`px-4 py-2 rounded-lg font-bold text-sm transition-colors border ${showSaved ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 hover:border-indigo-300'}`}
                >
                  {showSaved ? "Close Library" : "My Library"}
                </button>
                <button
                  onClick={() => signOut()}
                  className="px-4 py-2 text-sm text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
                >
                  Sign Out
                </button>
              </>
            ) : (
              <button
                onClick={() => signIn("google")}
                className="px-6 py-2.5 rounded-full bg-neutral-900 dark:bg-white text-white dark:text-black font-bold text-sm hover:opacity-80"
              >
                Sign In
              </button>
            )}
          </div>
        </header>

        {session && (
          <>
            {showSaved ? (
              <div className="bg-white dark:bg-neutral-900 rounded-2xl p-8 shadow-sm border border-neutral-200 dark:border-neutral-800 animate-in fade-in slide-in-from-top-4">
                <h2 className="text-2xl font-bold mb-6 flex items-center gap-2" style={{ fontFamily: 'var(--font-merriweather)' }}>
                  Your Library
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
                        onClick={() => handleDeckClick(deck.id)}
                        className="group relative p-6 rounded-xl bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 hover:shadow-md hover:border-indigo-300 transition-all cursor-pointer"
                      >
                        <button
                          onClick={(e) => handleDeleteDeck(deck.id, e)}
                          className="absolute top-4 right-4 text-neutral-300 hover:text-red-500 transition-colors z-10 opacity-0 group-hover:opacity-100"
                        >
                          ✕
                        </button>
                        <h3 className="font-bold text-lg mb-2 pr-6">{deck.title}</h3>
                        <p className="text-xs text-neutral-500 font-mono">{deck.words.length} words</p>
                        <p className="text-xs text-neutral-400 mt-4">{new Date(deck.createdAt).toLocaleDateString()}</p>
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
                      Enter Words
                    </label>
                    <textarea
                      className="w-full h-[300px] p-3 text-base bg-neutral-50 dark:bg-black border border-neutral-200 dark:border-neutral-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 resize-none mb-4 font-mono leading-relaxed"
                      placeholder={`apple\nrun\nbeautiful`}
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
                      {loading ? "Generating..." : "Generate List"}
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
                          <button onClick={handleClearList} className="text-xs font-bold text-red-500 hover:bg-red-50 px-3 py-2 rounded-lg transition-colors">Clear</button>
                          <input
                            type="text"
                            value={deckTitle}
                            onChange={(e) => setDeckTitle(e.target.value)}
                            placeholder="List Title..."
                            className="flex-1 bg-transparent font-bold text-lg focus:outline-none placeholder:font-normal"
                          />
                        </div>
                        <div className="flex gap-2 w-full sm:w-auto">
                          <button onClick={() => setShowAddToDeckModal(true)} className="px-4 py-2 text-xs font-bold border border-neutral-200 dark:border-neutral-700 rounded-lg hover:bg-neutral-50 transition-colors">
                            + Add Existing
                          </button>
                          <button onClick={handleSaveDeck} className="px-6 py-2 text-xs font-bold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-sm">
                            Save New
                          </button>
                        </div>
                      </div>

                      {/* Words List */}
                      <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-sm overflow-hidden">
                        {words.map((card, idx) => (
                          <div key={idx} className="group relative p-6 border-b border-neutral-100 dark:border-neutral-800 last:border-0 hover:bg-neutral-50/50 transition-colors">
                            <button onClick={() => handleRemoveWord(idx)} className="absolute top-4 right-4 text-neutral-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all">✕</button>

                            <div className="flex items-baseline gap-4 mb-3">
                              <span className="text-xl font-bold text-neutral-900 dark:text-neutral-100" style={{ fontFamily: 'var(--font-merriweather)' }}>{card.word}</span>
                              {card.partOfSpeech && (
                                <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-neutral-100 dark:bg-neutral-800 text-neutral-500 rounded-md">
                                  {card.partOfSpeech}
                                </span>
                              )}
                              <span className="text-neutral-600 dark:text-neutral-300 font-medium ml-auto sm:ml-0" style={{ fontFamily: 'var(--font-noto-serif-jp)' }}>{card.meaning}</span>
                            </div>

                            <div className="pl-4 border-l-2 border-indigo-100 dark:border-indigo-900/30 space-y-1">
                              <div className="flex items-start gap-2">
                                <button onClick={() => speak(card.example)} className="mt-0.5 text-neutral-300 hover:text-indigo-500"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg></button>
                                <p className="text-sm text-neutral-600 dark:text-neutral-400 italic font-serif">"{card.example}"</p>
                              </div>
                              <p className="text-xs text-neutral-400 font-light pl-6" style={{ fontFamily: 'var(--font-noto-serif-jp)' }}>{card.example_jp}</p>

                              {/* 追加の例文表示 (ロック状態) */}
                              {card.otherExamples && card.otherExamples.length > 0 && (
                                <div className="mt-2 pt-2 border-t border-neutral-100 dark:border-neutral-800">
                                  <button
                                    onClick={() => alert("詳細は単語帳に保存してからアンロックできます。")}
                                    className="text-xs font-bold text-neutral-400 hover:text-neutral-500 flex items-center gap-1 cursor-pointer"
                                  >
                                    <span>🔒</span> {card.otherExamples.length} more examples (Save to unlock)
                                  </button>
                                </div>
                              )}
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
    </div>
  );
}
