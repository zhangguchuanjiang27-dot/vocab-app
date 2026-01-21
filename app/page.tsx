"use client";

import { useState, useEffect } from "react";
import { useSession, signIn, signOut } from "next-auth/react";

// 型定義
type WordCard = {
  id?: string;
  word: string;
  partOfSpeech?: string; // 品詞
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
        // 既存のリストに追加（追記モード）
        setWords((prev) => [...prev, ...data.words]);
        // 入力欄はクリアしない方が連続入力しやすいかもしれないが、
        // ユーザーが「Enterwordsに残っている」と言及していたので、
        // 使い勝手を考慮して、生成成功したら入力欄は空にしたほうが親切かも？
        // 今回はユーザーの要望的に「どんどん追加」なので、入力欄はクリアして次を入れやすくする。
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

      if (!res.ok) throw new Error("Failed to add words");

      alert(`"${deckTitle}" に追加しました！`);
      setShowAddToDeckModal(false);
      setWords([]); // 追加後はクリア
      fetchDecks(); // 一覧更新
    } catch (e) {
      console.error(e);
      alert("追加に失敗しました");
    }
  };

  return (
    <div className="min-h-screen bg-[#f0e6d2] dark:bg-[#1a1614] text-neutral-800 dark:text-neutral-200 p-4 sm:p-8 font-serif transition-colors duration-300 flex items-center justify-center overflow-x-hidden">

      {/* Background Texture (Optional subtle pattern could be added here) */}

      {/* Add To Deck Modal */}
      {showAddToDeckModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200 backdrop-blur-sm">
          <div className="bg-[#fffcf7] dark:bg-[#1e1e1e] w-full max-w-md rounded-lg p-8 shadow-2xl border-4 border-[#e5e5e5] dark:border-[#333] relative">
            <button
              onClick={() => setShowAddToDeckModal(false)}
              className="absolute top-4 right-4 text-neutral-400 hover:text-red-500 transition-colors"
            >
              ✕
            </button>
            <h3 className="text-xl font-bold mb-6 text-center border-b-2 border-dotted border-neutral-300 pb-2">Destinations</h3>
            <div className="max-h-[50vh] overflow-y-auto flex flex-col gap-3 mb-6 pr-2 custom-scrollbar">
              {savedDecks.length === 0 ? (
                <p className="text-neutral-400 text-center py-8 italic">No saved notebooks yet.</p>
              ) : (
                savedDecks.map((deck) => (
                  <button
                    key={deck.id}
                    onClick={() => handleAddToExistingDeck(deck.id, deck.title)}
                    className="flex justify-between items-center p-4 rounded bg-white dark:bg-[#2a2a2a] border-l-4 border-indigo-500 hover:translate-x-1 transition-all shadow-sm group"
                  >
                    <span className="font-bold text-lg">{deck.title}</span>
                    <span className="text-xs text-neutral-400 group-hover:text-indigo-500 uppercase tracking-wider font-sans">
                      Add items
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main Notebook Container */}
      <main className="w-full max-w-7xl relative mx-auto my-8 perspective-1000">

        {/* Notebook Cover/Pages */}
        <div className="relative bg-white dark:bg-[#252525] rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.3)] flex flex-col lg:flex-row overflow-hidden min-h-[85vh]">

          {/* Spine / Rings (Center decoration for desktop) */}
          <div className="hidden lg:flex flex-col justify-center items-center absolute left-1/2 top-0 bottom-0 w-16 -ml-8 z-20 bg-transparent pointer-events-none gap-4 py-8">
            {[...Array(12)].map((_, i) => (
              <div key={i} className="w-full h-8 flex items-center justify-center relative">
                {/* Ring Visual */}
                <div className="w-12 h-6 rounded-full border-[6px] border-[#d4d4d4] dark:border-[#444] bg-gradient-to-b from-[#e5e5e5] to-[#a3a3a3] shadow-md z-10 skew-y-6"></div>
                {/* Hole Shadows */}
                <div className="absolute left-[-4px] w-3 h-3 rounded-full bg-black/20 dark:bg-black/50 top-1/2 -translate-y-1/2"></div>
                <div className="absolute right-[-4px] w-3 h-3 rounded-full bg-black/20 dark:bg-black/50 top-1/2 -translate-y-1/2"></div>
              </div>
            ))}
          </div>

          {/* Left Page (Input) */}
          <div className="flex-1 p-8 sm:p-12 border-r border-neutral-200 dark:border-neutral-800 bg-[#fdfbf7] dark:bg-[#1e1e1e] relative">
            {/* Header */}
            <header className="mb-8 flex justify-between items-start">
              <div>
                <h1 className="text-4xl font-black text-neutral-800 dark:text-neutral-100 tracking-tight mb-2" style={{ fontFamily: 'var(--font-merriweather)' }}>
                  Vocab Builder
                </h1>
                <p className="text-sm text-neutral-500 dark:text-neutral-400 font-sans tracking-widest uppercase">
                  Personal Dictionary v1.0
                </p>
              </div>
              <div className="text-right">
                {/* Credits Badge */}
                {session?.user && (
                  <div className="inline-flex items-center gap-2 bg-neutral-100 dark:bg-[#2a2a2a] px-3 py-1 rounded-full border border-neutral-200 dark:border-neutral-700">
                    <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Credits</span>
                    <span className="font-mono text-indigo-600 dark:text-indigo-400 font-bold">{credits ?? '-'}</span>
                  </div>
                )}
              </div>
            </header>

            {/* Input Area */}
            <div className="relative h-full flex flex-col">
              <label className="block text-sm font-bold text-neutral-400 uppercase tracking-widest mb-4 font-sans">
                Input Words
              </label>

              <div className="flex-1 relative group">
                {/* Lined Paper Lines Background */}
                <div className="absolute inset-x-0 top-0 bottom-0 pointer-events-none select-none"
                  style={{
                    backgroundImage: 'repeating-linear-gradient(transparent 0px, transparent 31px, #e5e5e5 32px)',
                    backgroundAttachment: 'local'
                  }}>
                </div>

                <textarea
                  className="w-full h-[500px] bg-transparent text-xl leading-8 p-0 resize-none focus:outline-none text-neutral-700 dark:text-neutral-300 font-serif"
                  style={{ lineHeight: '32px' }}
                  placeholder="Type words here..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                />
              </div>

              <div className="mt-6 flex gap-4">
                {session ? (
                  <>
                    <button
                      onClick={handleGenerate}
                      disabled={loading || !input.trim()}
                      className={`
                        flex-1 py-4 rounded-lg font-bold text-sm tracking-widest uppercase transition-all shadow-lg transform active:scale-95 font-sans
                        ${loading || !input.trim()
                          ? "bg-neutral-200 text-neutral-400 cursor-not-allowed"
                          : "bg-neutral-900 dark:bg-white text-white dark:text-black hover:bg-neutral-800 dark:hover:bg-neutral-200"
                        }
                      `}
                    >
                      {loading ? "Generating..." : "Generate Cards"}
                    </button>
                    {!showSaved && (
                      <button
                        onClick={handlePurchase}
                        className="px-6 py-4 rounded-lg border-2 border-amber-400 text-amber-600 dark:text-amber-400 font-bold text-xs uppercase tracking-widest hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
                      >
                        Buy Coins
                      </button>
                    )}
                  </>
                ) : (
                  <button
                    onClick={() => signIn("google")}
                    className="w-full py-4 rounded-lg bg-indigo-600 text-white font-bold text-sm uppercase tracking-widest hover:bg-indigo-700 transition-colors shadow-lg"
                  >
                    Sign In to Start
                  </button>
                )}
              </div>

              <button
                onClick={() => setShowSaved(!showSaved)}
                className="mt-6 text-center text-xs font-bold text-neutral-400 uppercase tracking-widest hover:text-indigo-500 transition-colors font-sans"
              >
                {showSaved ? "← Back to Input" : "View My Library"}
              </button>
            </div>
          </div>

          {/* Right Page (Output/Library) */}
          <div className="flex-1 p-8 sm:p-12 bg-[#fdfbf7] dark:bg-[#1e1e1e] relative min-h-[500px]">
            {/* Paper Texture Overlay */}
            <div className="absolute inset-0 pointer-events-none opacity-[0.03]" style={{ backgroundImage: 'url("https://www.transparenttextures.com/patterns/paper.png")' }}></div>

            {/* Content */}
            {showSaved ? (
              // Saved Decks Viewer
              <div className="relative z-10 h-full flex flex-col">
                <h2 className="text-2xl font-bold mb-6 font-serif border-b-4 border-double border-neutral-200 pb-2">My Library</h2>
                <div className="grid grid-cols-1 gap-4 overflow-y-auto pr-2 custom-scrollbar flex-1 pb-20">
                  {savedDecks.map((deck) => (
                    <div key={deck.id} onClick={() => handleLoadDeck(deck)} className="p-4 border-b border-neutral-200 dark:border-neutral-800 hover:bg-black/5 cursor-pointer group transition-colors">
                      <div className="flex justify-between items-baseline mb-1">
                        <h3 className="font-bold text-lg font-serif">{deck.title}</h3>
                        <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={(e) => handleDeleteDeck(deck.id, e)} className="text-red-400 hover:text-red-600 p-1">✕</button>
                        </div>
                      </div>
                      <p className="text-xs text-neutral-400 font-sans uppercase tracking-wider">{deck.words.length} Words • {new Date(deck.createdAt).toLocaleDateString()}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              // Current Vocabulary List
              <div className="relative z-10 h-full flex flex-col">
                {/* Action Bar */}
                <div className="flex items-center gap-3 mb-6 sticky top-0 bg-[#fdfbf7]/90 dark:bg-[#1e1e1e]/90 backdrop-blur-sm py-2 z-20 border-b border-neutral-200 pb-4">
                  {words.length > 0 && (
                    <>
                      <button
                        onClick={handleClearList}
                        className="text-red-400 hover:text-red-600 text-xs font-bold uppercase tracking-wider font-sans px-2"
                      >
                        Clear
                      </button>
                      <div className="flex-1">
                        <input
                          type="text"
                          placeholder="Notebook Title..."
                          value={deckTitle}
                          onChange={(e) => setDeckTitle(e.target.value)}
                          className="w-full bg-transparent border-b border-neutral-300 focus:border-indigo-500 outline-none text-xl font-serif font-bold placeholder:text-neutral-300"
                        />
                      </div>
                      <button onClick={() => setShowAddToDeckModal(true)} className="p-2 text-neutral-400 hover:text-indigo-600 transition-colors" title="Add to Existing">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14" /><path d="M5 12h14" /></svg>
                      </button>
                      <button onClick={handleSaveDeck} className="p-2 text-neutral-400 hover:text-indigo-600 transition-colors" title="Save New">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" /></svg>
                      </button>
                    </>
                  )}
                  {words.length === 0 && (
                    <h2 className="text-2xl font-bold font-serif text-neutral-300">New List</h2>
                  )}
                </div>

                {/* List Content */}
                <div className="flex-1 overflow-y-auto pr-4 custom-scrollbar pb-20">
                  {words.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-neutral-300 dark:text-neutral-600 gap-4">
                      <span className="text-6xl font-serif opacity-20">Aa</span>
                      <p className="font-sans text-sm uppercase tracking-widest text-center max-w-xs">Enter words on the left page and click generate to fill this page.</p>
                    </div>
                  ) : (
                    <div className="flex flex-col">
                      {words.map((card, idx) => (
                        <div key={idx} className="group relative py-6 border-b border-dashed border-neutral-300 dark:border-neutral-700 last:border-0 hover:bg-neutral-50 dark:hover:bg-neutral-800/30 transition-colors -mx-4 px-4 rounded-lg">
                          <button
                            onClick={() => handleRemoveWord(idx)}
                            className="absolute top-4 right-4 text-neutral-200 group-hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                          >
                            ✕
                          </button>

                          {/* Header: Word & POS */}
                          <div className="flex items-baseline gap-3 mb-2">
                            <span className="text-2xl font-black text-neutral-800 dark:text-neutral-100 font-serif" style={{ fontFamily: 'var(--font-merriweather)' }}>
                              {card.word}
                            </span>
                            {card.partOfSpeech && (
                              <span className="text-[10px] font-bold uppercase tracking-wider text-white bg-neutral-800 dark:bg-neutral-600 px-2 py-0.5 rounded-sm">
                                {card.partOfSpeech}
                              </span>
                            )}
                          </div>

                          {/* Meaning */}
                          <div className="mb-3">
                            <span className="text-lg text-indigo-900 dark:text-indigo-300 font-bold border-b-2 border-indigo-100 dark:border-indigo-900/50 pb-0.5" style={{ fontFamily: 'var(--font-noto-serif-jp)' }}>
                              {card.meaning}
                            </span>
                          </div>

                          {/* Examples */}
                          <div className="pl-4 border-l-2 border-neutral-200 dark:border-neutral-700 space-y-1">
                            <p className="text-sm text-neutral-600 dark:text-neutral-400 italic font-serif">
                              "{card.example}"
                            </p>
                            <p className="text-xs text-neutral-400 dark:text-neutral-500 font-sans" style={{ fontFamily: 'var(--font-noto-serif-jp)' }}>
                              {card.example_jp}
                            </p>
                          </div>

                          <div className="absolute right-2 bottom-2 text-[10px] text-neutral-200 font-mono select-none">
                            {idx + 1}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Global CSS for scrollbar and fonts */}
      <style jsx global>{`
        .perspective-1000 { perspective: 1000px; }
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #e5e5e5; border-radius: 3px; }
        .dark .custom-scrollbar::-webkit-scrollbar-thumb { background: #444; }
      `}</style>
    </div>
  );
}
