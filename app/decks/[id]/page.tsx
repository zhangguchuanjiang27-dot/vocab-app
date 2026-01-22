"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";

type WordCard = {
    id?: string;
    word: string;
    partOfSpeech?: string;
    meaning: string;
    example: string;
    example_jp: string;
    createdAt?: string;
};

type Deck = {
    id: string;
    title: string;
    words: WordCard[];
};

export default function DeckPage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const params = useParams();
    const deckId = params.id as string;

    const [deck, setDeck] = useState<Deck | null>(null);
    const [loading, setLoading] = useState(true);

    // モード管理: 'list' (一覧) | 'flashcard' (学習)
    const [mode, setMode] = useState<'list' | 'flashcard'>('list');

    // Flashcard state
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isFlipped, setIsFlipped] = useState(false);
    const [isFinished, setIsFinished] = useState(false);

    // Title edit state
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [editTitle, setEditTitle] = useState("");

    // Sort & Filter
    const [sortKey, setSortKey] = useState<'created_desc' | 'created_asc' | 'pos'>('created_asc');

    // Move Word State
    const [myDecks, setMyDecks] = useState<Deck[]>([]); // 移動先候補用
    const [showMoveModal, setShowMoveModal] = useState(false);
    const [selectedWordId, setSelectedWordId] = useState<string | null>(null);

    useEffect(() => {
        if (status === "unauthenticated") {
            router.push("/");
        } else if (session?.user && deckId) {
            fetchDeck();
            fetchMyDecks();
        }
    }, [session, status, deckId]);

    const fetchDeck = async () => {
        try {
            const res = await fetch(`/api/decks/${deckId}`);
            if (res.ok) {
                const data = await res.json();
                setDeck(data);
                setEditTitle(data.title);
            } else {
                alert("Failed to load deck");
                router.push("/");
            }
        } catch (e) {
            console.error(e);
            alert("Error loading deck");
        } finally {
            setLoading(false);
        }
    };

    const fetchMyDecks = async () => {
        try {
            const res = await fetch("/api/decks");
            if (res.ok) {
                const data = await res.json();
                // 自分自身以外のデッキを候補にする
                setMyDecks(data.filter((d: Deck) => d.id !== deckId));
            }
        } catch (e) {
            console.error("Failed to fetch decks for move", e);
        }
    };

    const handleUpdateTitle = async () => {
        if (!editTitle.trim() || !deck) return;

        try {
            const res = await fetch(`/api/decks/${deckId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title: editTitle }),
            });

            if (res.ok) {
                setDeck({ ...deck, title: editTitle });
                setIsEditingTitle(false);
            } else {
                alert("Failed to update title");
            }
        } catch (e) {
            console.error(e);
            alert("Error updating title");
        }
    };

    const handleDeleteWord = async (wordId: string | undefined) => {
        if (!wordId || !deck) return;
        if (!confirm("本当にこの単語を削除しますか？")) return;

        try {
            const res = await fetch(`/api/words/${wordId}`, {
                method: "DELETE"
            });

            if (res.ok) {
                setDeck({
                    ...deck,
                    words: deck.words.filter(w => w.id !== wordId)
                });
            } else {
                alert("削除に失敗しました");
            }
        } catch (e) {
            console.error(e);
            alert("エラーが発生しました");
        }
    };

    const handleMoveWord = async (targetDeckId: string) => {
        if (!selectedWordId || !deck) return;

        try {
            const res = await fetch(`/api/words/${selectedWordId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ deckId: targetDeckId })
            });

            if (res.ok) {
                // 現在のリストから削除
                setDeck({
                    ...deck,
                    words: deck.words.filter(w => w.id !== selectedWordId)
                });
                setShowMoveModal(false);
                setSelectedWordId(null);
                alert("移動しました！");
            } else {
                alert("移動に失敗しました");
            }
        } catch (e) {
            console.error(e);
            alert("エラーが発生しました");
        }
    };

    // ソートロジック
    const getSortedWords = () => {
        if (!deck) return [];
        const words = [...deck.words];
        switch (sortKey) {
            case 'created_asc':
                return words.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
            case 'created_desc':
                return words.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
            case 'pos':
                return words.sort((a, b) => (a.partOfSpeech || '').localeCompare(b.partOfSpeech || ''));
            default:
                return words;
        }
    };

    const sortedWords = getSortedWords();


    const handleNext = () => {
        if (!deck) return;
        setIsFlipped(false);
        if (currentIndex < deck.words.length - 1) {
            setTimeout(() => setCurrentIndex((prev) => prev + 1), 150);
        } else {
            setIsFinished(true);
        }
    };

    const handlePrev = () => {
        if (currentIndex > 0) {
            setIsFlipped(false);
            setTimeout(() => setCurrentIndex((prev) => prev - 1), 150);
        }
    };

    const handleRestart = () => {
        setIsFinished(false);
        setCurrentIndex(0);
        setIsFlipped(false);
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-neutral-50 dark:bg-black">
                <div className="animate-spin h-8 w-8 border-4 border-indigo-500 rounded-full border-t-transparent"></div>
            </div>
        );
    }

    if (!deck) return null;

    // --- フラッシュカードモード ---
    if (mode === 'flashcard') {
        if (isFinished) {
            return (
                <div className="min-h-screen flex flex-col items-center justify-center bg-neutral-50 dark:bg-black p-6">
                    <div className="text-center space-y-6 animate-in zoom-in duration-300">
                        <div className="text-6xl mb-4">🎉</div>
                        <h1 className="text-3xl font-bold dark:text-white">Congratulations!</h1>
                        <p className="text-neutral-500">You've completed "{deck.title}".</p>
                        <div className="flex gap-4 justify-center mt-8">
                            <button onClick={handleRestart} className="px-8 py-3 bg-indigo-600 text-white rounded-full font-bold shadow-lg hover:bg-indigo-700 transition w-full sm:w-auto">Again</button>
                            <button onClick={() => setMode('list')} className="px-8 py-3 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-full font-bold hover:bg-neutral-50 dark:hover:bg-neutral-700 transition w-full sm:w-auto">Back to List</button>
                        </div>
                    </div>
                </div>
            );
        }

        const currentCard = deck.words[currentIndex];

        return (
            <div className="min-h-screen bg-neutral-100 dark:bg-[#111] text-neutral-900 dark:text-neutral-100 p-6 flex flex-col">
                <header className="flex justify-between items-center mb-8 max-w-4xl mx-auto w-full">
                    <button onClick={() => setMode('list')} className="text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition font-bold text-sm">✕ Close</button>
                    <div className="text-center">
                        <h1 className="font-bold text-lg dark:text-white/90">{deck.title}</h1>
                        <p className="text-xs text-neutral-400 font-mono mt-1">{currentIndex + 1} / {deck.words.length}</p>
                    </div>
                    <div className="w-12"></div>
                </header>

                <main className="flex-1 flex flex-col items-center justify-center perspective-1000 w-full max-w-2xl mx-auto">
                    <div className="relative w-full aspect-[4/3] sm:aspect-[3/2] cursor-pointer group" onClick={() => setIsFlipped(!isFlipped)}>
                        <div className={`absolute inset-0 w-full h-full duration-500 preserve-3d transition-transform ${isFlipped ? "rotate-y-180" : ""}`}>
                            {/* Front */}
                            <div className="absolute inset-0 backface-hidden bg-white dark:bg-[#1e1e1e] rounded-3xl shadow-xl flex flex-col items-center justify-center p-8 border border-neutral-200 dark:border-neutral-800">
                                <span className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-4">Word</span>
                                <h2 className="text-5xl sm:text-6xl font-black text-center mb-4" style={{ fontFamily: 'var(--font-merriweather)' }}>{currentCard.word}</h2>
                                {currentCard.partOfSpeech && <span className="px-3 py-1 bg-neutral-100 dark:bg-neutral-800 text-neutral-500 rounded-full text-sm font-medium">{currentCard.partOfSpeech}</span>}
                                <p className="absolute bottom-8 text-neutral-300 dark:text-neutral-600 text-xs font-bold animate-pulse">Click to flip ↻</p>
                            </div>
                            {/* Back */}
                            <div className="absolute inset-0 backface-hidden rotate-y-180 bg-indigo-600 dark:bg-indigo-900 text-white rounded-3xl shadow-xl flex flex-col items-center justify-center p-8 sm:p-12 text-center">
                                <span className="text-xs font-bold text-indigo-200 uppercase tracking-widest mb-6 border-b border-indigo-400/30 pb-1">Meaning</span>
                                <h3 className="text-3xl sm:text-4xl font-bold mb-8" style={{ fontFamily: 'var(--font-noto-serif-jp)' }}>{currentCard.meaning}</h3>
                                <div className="w-full bg-black/10 rounded-xl p-6 text-left">
                                    <p className="text-lg italic font-serif mb-2 text-indigo-50">"{currentCard.example}"</p>
                                    <p className="text-sm text-indigo-200 font-light" style={{ fontFamily: 'var(--font-noto-serif-jp)' }}>{currentCard.example_jp}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-6 mt-12 w-full max-w-sm justify-between">
                        <button onClick={handlePrev} disabled={currentIndex === 0} className={`p-4 rounded-full transition-all ${currentIndex === 0 ? "text-neutral-300 cursor-not-allowed" : "bg-white dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 shadow-lg hover:scale-110 active:scale-95"}`}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg></button>
                        <span className="text-sm font-bold text-neutral-400 uppercase tracking-widest">{isFlipped ? "Back" : "Front"}</span>
                        <button onClick={handleNext} className="p-4 rounded-full bg-indigo-600 text-white shadow-lg shadow-indigo-500/30 hover:bg-indigo-700 hover:scale-110 transition-all active:scale-95"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg></button>
                    </div>
                </main>
                <style jsx global>{` .perspective-1000 { perspective: 1000px; } .preserve-3d { transform-style: preserve-3d; } .backface-hidden { backface-visibility: hidden; } .rotate-y-180 { transform: rotateY(180deg); } `}</style>
            </div>
        );
    }

    // --- リストモード ---
    return (
        <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 p-6 sm:p-12 font-sans transition-colors duration-300">

            {/* Move Modal */}
            {showMoveModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-white dark:bg-neutral-900 w-full max-w-sm rounded-2xl p-6 shadow-2xl border border-neutral-200 dark:border-neutral-800">
                        <h3 className="text-lg font-bold mb-4">Move to...</h3>
                        <div className="max-h-[300px] overflow-y-auto flex flex-col gap-2 mb-4">
                            {myDecks.length === 0 ? (
                                <p className="text-neutral-500 text-sm">移動先の単語帳がありません</p>
                            ) : (
                                myDecks.map(d => (
                                    <button
                                        key={d.id}
                                        onClick={() => handleMoveWord(d.id)}
                                        className="text-left px-4 py-3 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 text-sm font-bold"
                                    >
                                        {d.title}
                                    </button>
                                ))
                            )}
                        </div>
                        <button onClick={() => setShowMoveModal(false)} className="w-full py-2 bg-neutral-200 dark:bg-neutral-800 rounded-lg font-bold text-sm">Cancel</button>
                    </div>
                </div>
            )}

            <header className="max-w-4xl mx-auto flex items-center justify-between mb-8">
                <Link href="/" className="px-4 py-2 text-sm font-bold text-neutral-500 hover:bg-neutral-200 dark:hover:bg-neutral-800 rounded-lg transition-colors">← Back to Home</Link>
            </header>

            <main className="max-w-4xl mx-auto">
                {/* Cover / Info */}
                <div className="bg-white dark:bg-neutral-900 rounded-3xl p-8 sm:p-12 shadow-sm border border-neutral-200 dark:border-neutral-800 mb-8 text-center sm:text-left flex flex-col sm:flex-row items-center justify-between gap-6">
                    <div className="flex-1">
                        {isEditingTitle ? (
                            <div className="flex gap-2 mb-2 justify-center sm:justify-start">
                                <input
                                    value={editTitle}
                                    onChange={(e) => setEditTitle(e.target.value)}
                                    className="text-3xl sm:text-4xl font-black bg-neutral-100 dark:bg-neutral-800 border-2 border-indigo-500 rounded-lg px-2 py-1 w-full max-w-md focus:outline-none"
                                    onKeyDown={(e) => e.key === 'Enter' && handleUpdateTitle()}
                                />
                                <button onClick={handleUpdateTitle} className="px-4 py-2 bg-indigo-600 text-white font-bold rounded-lg text-sm shrink-0">Save</button>
                                <button onClick={() => setIsEditingTitle(false)} className="px-4 py-2 bg-neutral-200 dark:bg-neutral-800 font-bold rounded-lg text-sm shrink-0">Cancel</button>
                            </div>
                        ) : (
                            <h1 className="text-3xl sm:text-4xl font-black mb-2 group cursor-pointer flex items-center gap-3 justify-center sm:justify-start" onClick={() => setIsEditingTitle(true)}>
                                <span style={{ fontFamily: 'var(--font-merriweather)' }}>{deck.title}</span>
                                <span className="opacity-0 group-hover:opacity-100 text-neutral-400 text-sm">✎</span>
                            </h1>
                        )}
                        <p className="text-neutral-500 font-mono">{deck.words.length} items</p>
                    </div>

                    {deck.words.length > 0 && (
                        <button onClick={() => { handleRestart(); setMode('flashcard'); }} className="px-8 py-4 bg-indigo-600 text-white text-lg font-bold rounded-full shadow-lg hover:bg-indigo-700 hover:shadow-indigo-500/30 hover:-translate-y-1 transition-all active:scale-95 flex items-center gap-3">
                            <span className="text-2xl">▶</span> Start Flashcards
                        </button>
                    )}
                </div>

                {/* Word List */}
                <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/50 flex flex-col sm:flex-row items-center justify-between gap-4">
                        <h2 className="font-bold text-neutral-400 uppercase tracking-widest text-sm">Word List</h2>

                        {/* Sort Controls */}
                        <div className="flex items-center gap-2 text-sm">
                            <span className="text-neutral-500 font-bold text-xs uppercase">Sort by:</span>
                            <select
                                value={sortKey}
                                onChange={(e) => setSortKey(e.target.value as any)}
                                className="bg-white dark:bg-black border border-neutral-200 dark:border-neutral-700 rounded-lg px-2 py-1 font-bold focus:outline-none"
                            >
                                <option value="created_asc">Created (Oldest)</option>
                                <option value="created_desc">Created (Newest)</option>
                                <option value="pos">Part of Speech</option>
                            </select>
                        </div>
                    </div>

                    {sortedWords.length === 0 ? (
                        <div className="p-12 text-center text-neutral-400">No words in this deck. Add some from the home page!</div>
                    ) : (
                        sortedWords.map((card, idx) => (
                            <div key={card.id || idx} className="group p-6 border-b border-neutral-100 dark:border-neutral-800 last:border-0 hover:bg-neutral-50 dark:hover:bg-neutral-800/30 transition-colors flex flex-col sm:flex-row gap-4 sm:items-baseline relative">
                                <div className="flex items-baseline gap-3 min-w-[200px]">
                                    <span className="text-lg font-bold font-serif" style={{ fontFamily: 'var(--font-merriweather)' }}>{card.word}</span>
                                    {card.partOfSpeech && (
                                        <span className="text-xs bg-neutral-100 dark:bg-neutral-800 px-2 py-0.5 rounded text-neutral-500 font-medium">{card.partOfSpeech}</span>
                                    )}
                                </div>
                                <div className="flex-1 pr-16">
                                    <div className="font-medium text-neutral-800 dark:text-neutral-200 mb-2" style={{ fontFamily: 'var(--font-noto-serif-jp)' }}>{card.meaning}</div>
                                    <div className="space-y-1">
                                        <div className="text-sm text-neutral-500 italic">"{card.example}"</div>
                                        {/* 和訳を追加表示 */}
                                        <div className="text-xs text-neutral-400 font-light" style={{ fontFamily: 'var(--font-noto-serif-jp)' }}>{card.example_jp}</div>
                                    </div>
                                </div>

                                {/* Action Buttons */}
                                <div className="absolute top-4 right-4 flex gap-2 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                                    <button
                                        onClick={() => { setSelectedWordId(card.id || null); setShowMoveModal(true); }}
                                        className="p-2 text-neutral-300 hover:text-indigo-500 bg-white/50 dark:bg-black/50 sm:bg-transparent rounded-full"
                                        title="Move to another deck"
                                    >
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 14L4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11" /></svg>
                                    </button>
                                    <button
                                        onClick={() => handleDeleteWord(card.id)}
                                        className="p-2 text-neutral-300 hover:text-red-500 bg-white/50 dark:bg-black/50 sm:bg-transparent rounded-full"
                                        title="Remove word"
                                    >
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg>
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </main>
        </div>
    );
}
