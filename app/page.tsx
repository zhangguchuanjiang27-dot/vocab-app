"use client";

import { useState, useEffect } from "react";
import { useSession, signIn, signOut } from "next-auth/react";

// 型定義
type WordCard = {
  id?: string;
  word: string;
  meaning: string;
  example: string;
  example_jp: string;
};

type Deck = {
  id: string;
  title: string;
  createdAt: string;
  words: WordCard[];
};

export default function Home() {
  const { data: session, status } = useSession();
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

  // 初回ロード時にデータをAPIから取得
  useEffect(() => {
    if (session?.user) {
      fetchDecks();
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

      if (!res.ok) throw new Error("Failed to save");

      const newDeck = await res.json();
      setDeckTitle("");
      alert(`"${newDeck.title}" を保存しました！`);

      // リスト更新
      fetchDecks();
    } catch (e) {
      console.error(e);
      alert("保存できませんでした。ネットワーク接続などを確認してください。");
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
      }
    } catch (e) {
      console.error(e);
      alert("削除に失敗しました");
    }
  };

  // デッキ読み込み処理
  const handleLoadDeck = (deck: Deck) => {
    setWords(deck.words);
    setInput(deck.words.map(w => w.word).join("\n"));
    window.scrollTo({ top: 0, behavior: "smooth" });
    setShowSaved(false);
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
        setWords(data.words);
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

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 p-8 sm:p-20 transition-colors duration-300">
      <main className="max-w-6xl mx-auto flex flex-col gap-12">

        {/* Header with Auth */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="text-center md:text-left">
            <h1 className="text-4xl font-extrabold tracking-tight bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400 bg-clip-text text-transparent">
              AI Vocabulary Builder v1.0
            </h1>
            <p className="text-sm text-neutral-500 mt-1">
              Your Personal Cloud Dictionary
            </p>
          </div>

          <div className="flex items-center gap-4">
            {isLoadingSession ? (
              <div className="h-10 w-24 bg-neutral-200 dark:bg-neutral-800 animate-pulse rounded-full"></div>
            ) : session ? (
              <>
                <div className="flex items-center gap-3">
                  {session.user?.image && (
                    <img src={session.user.image} alt="User" className="w-8 h-8 rounded-full border border-neutral-200" />
                  )}
                  <span className="text-sm font-medium hidden sm:inline">{session.user?.name}</span>
                </div>
                <button
                  onClick={() => setShowSaved(!showSaved)}
                  className="px-5 py-2.5 rounded-full font-medium text-sm transition-all border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-900 flex items-center gap-2"
                >
                  <span className="text-lg">📚</span>
                  {showSaved ? "Hide Decks" : "My Decks"}
                </button>
                <button
                  onClick={() => signOut()}
                  className="px-5 py-2.5 rounded-full font-medium text-sm transition-all bg-neutral-200 dark:bg-neutral-800 hover:bg-neutral-300 dark:hover:bg-neutral-700"
                >
                  Log Out
                </button>
              </>
            ) : (
              <button
                onClick={() => signIn("google")}
                className="px-6 py-3 rounded-full font-bold text-white bg-blue-600 hover:bg-blue-700 transition-colors flex items-center gap-2 shadow-lg hover:shadow-blue-500/30"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#fff" /><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#fff" /><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#fff" /><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#fff" /></svg>
                Sign in with Google
              </button>
            )}
          </div>
        </div>

        {/* Auth Guard/Welcome */}
        {!session && !isLoadingSession && (
          <div className="py-20 text-center animate-in fade-in slide-in-from-bottom-4 duration-700">
            <h2 className="text-3xl font-bold mb-4">あなただけの単語帳を作成しましょう</h2>
            <p className="text-neutral-500 max-w-lg mx-auto mb-8">
              Googleアカウントでログインすると、作成した単語帳がクラウドに保存され、
              どのデバイスからでもアクセスできるようになります。
            </p>
          </div>
        )}

        {/* Main Content (Protected) */}
        {session && (
          <>
            {/* Saved Decks Viewer */}
            {showSaved && (
              <div className="bg-white dark:bg-neutral-900 rounded-2xl p-6 shadow-xl border border-neutral-200 dark:border-neutral-800 animate-in slide-in-from-top-4 duration-300">
                <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                  <span className="text-indigo-500">📚</span> Library ({savedDecks.length})
                </h2>
                {savedDecks.length === 0 ? (
                  <p className="text-neutral-500 text-sm">No saved decks yet. Generate and save one!</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {savedDecks.map((deck) => (
                      <div
                        key={deck.id}
                        onClick={() => handleLoadDeck(deck)}
                        className="p-4 rounded-xl bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 cursor-pointer hover:border-indigo-500 hover:shadow-md transition-all group relative"
                      >
                        <div className="flex justify-between items-start mb-2">
                          <h3 className="font-bold truncate pr-6 text-lg">{deck.title}</h3>
                          <button
                            onClick={(e) => handleDeleteDeck(deck.id, e)}
                            className="opacity-0 group-hover:opacity-100 text-neutral-400 hover:text-red-500 p-1.5 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 transition-all absolute top-2 right-2"
                            title="Delete this deck"
                          >
                            🗑️
                          </button>
                        </div>
                        <div className="text-xs text-neutral-500 flex justify-between items-end mt-4">
                          <span className="bg-neutral-200 dark:bg-neutral-800 px-2 py-1 rounded-md">{deck.words.length} words</span>
                          <span>{new Date(deck.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="grid lg:grid-cols-[350px_1fr] gap-8 items-start">
              {/* Left Column: Input */}
              <div className="flex flex-col gap-6 sticky top-8">
                <div className="bg-white dark:bg-neutral-900 p-6 rounded-2xl shadow-sm border border-neutral-200 dark:border-neutral-800">
                  <label className="block text-sm font-medium mb-2 text-neutral-700 dark:text-neutral-300">
                    Enter Words
                  </label>
                  <textarea
                    className="w-full h-[300px] p-4 text-base bg-neutral-50 dark:bg-black border border-neutral-200 dark:border-neutral-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-none transition-all placeholder:text-neutral-400"
                    placeholder="apple&#13;&#10;freedom&#13;&#10;explore..."
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                  />
                  <button
                    onClick={handleGenerate}
                    disabled={loading || !input.trim()}
                    className={`
                    mt-4 w-full py-3 rounded-xl font-bold text-sm shadow-md overflow-hidden transition-all
                    ${loading || !input.trim()
                        ? "bg-neutral-200 dark:bg-neutral-800 text-neutral-400 cursor-not-allowed"
                        : "bg-indigo-600 text-white hover:bg-indigo-700 hover:shadow-indigo-500/30 active:scale-95"
                      }
                  `}
                  >
                    {loading ? "Generating..." : "Generate Cards"}
                  </button>
                  {error && <p className="mt-3 text-xs text-red-500 text-center">{error}</p>}
                </div>
              </div>

              {/* Right Column: Output */}
              <div className="flex flex-col gap-6">
                {words.length > 0 ? (
                  <>
                    {/* Save Bar */}
                    <div className="bg-white dark:bg-neutral-900 p-4 rounded-xl flex flex-col sm:flex-row gap-3 items-center justify-between border border-indigo-100 dark:border-indigo-500/20 shadow-sm">
                      <div className="flex items-center gap-3 w-full">
                        <div className="h-10 w-10 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-xl">
                          💾
                        </div>
                        <input
                          type="text"
                          placeholder="単語帳の名前（例: Chapter 1）"
                          value={deckTitle}
                          onChange={(e) => setDeckTitle(e.target.value)}
                          className="flex-1 bg-transparent border-none focus:ring-0 text-lg font-medium placeholder:text-neutral-400"
                        />
                      </div>
                      <button
                        onClick={handleSaveDeck}
                        className="w-full sm:w-auto whitespace-nowrap px-6 py-3 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 hover:shadow-lg transition-all active:scale-95"
                      >
                        保存する
                      </button>
                    </div>

                    {/* Cards Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in duration-500">
                      {words.map((card, idx) => (
                        <div
                          key={idx}
                          className="group relative bg-white dark:bg-neutral-900 rounded-xl p-5 shadow-sm border border-neutral-200 dark:border-neutral-800 hover:shadow-md transition-all duration-300"
                        >
                          <div className="flex flex-col gap-2">
                            <div className="flex justify-between items-baseline border-b border-neutral-100 dark:border-neutral-800 pb-2 mb-1">
                              <h2 className="text-2xl font-bold text-neutral-900 dark:text-white">
                                {card.word}
                              </h2>
                              <span className="text-xs font-mono text-neutral-400">#{idx + 1}</span>
                            </div>
                            <p className="text-indigo-600 dark:text-indigo-400 font-semibold text-sm">
                              {card.meaning}
                            </p>
                            <div className="mt-2 text-sm space-y-1">
                              <p className="text-neutral-700 dark:text-neutral-300 italic border-l-2 border-neutral-200 dark:border-neutral-700 pl-2">
                                {card.example}
                              </p>
                              <p className="text-neutral-500 dark:text-neutral-500 pl-2.5 text-xs">
                                {card.example_jp}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  // Empty State
                  <div className="h-full min-h-[400px] flex items-center justify-center rounded-2xl border-2 border-dashed border-neutral-200 dark:border-neutral-800 text-neutral-400 flex-col gap-4">
                    <span className="text-4xl opacity-50">✨</span>
                    <p>単語を入力して Generate を押してください</p>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
