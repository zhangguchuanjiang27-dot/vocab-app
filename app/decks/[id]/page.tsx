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

    useEffect(() => {
        if (status === "unauthenticated") {
            router.push("/");
        } else if (session?.user && deckId) {
            fetchDeck();
        }
    }, [session, status, deckId]);

    const fetchDeck = async () => {
        try {
            const res = await fetch(`/api/decks/${deckId}`);
            if (res.ok) {
                const data = await res.json();
                setDeck(data);
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

    // --- フラッシュカードモードの表示 ---
    if (mode === 'flashcard') {
        if (isFinished) {
            return (
                <div className="min-h-screen flex flex-col items-center justify-center bg-neutral-50 dark:bg-black p-6">
                    <div className="text-center space-y-6 animate-in zoom-in duration-300">
                        <div className="text-6xl mb-4">🎉</div>
                        <h1 className="text-3xl font-bold dark:text-white">Congratulations!</h1>
                        <p className="text-neutral-500">You've completed "{deck.title}".</p>
                        <div className="flex gap-4 justify-center mt-8">
                            <button
                                onClick={handleRestart}
                                className="px-8 py-3 bg-indigo-600 text-white rounded-full font-bold shadow-lg hover:bg-indigo-700 transition w-full sm:w-auto"
                            >
                                Again
                            </button>
                            <button
                                onClick={() => setMode('list')}
                                className="px-8 py-3 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-full font-bold hover:bg-neutral-50 dark:hover:bg-neutral-700 transition w-full sm:w-auto"
                            >
                                Back to List
                            </button>
                        </div>
                    </div>
                </div>
            );
        }

        const currentCard = deck.words[currentIndex];

        return (
            <div className="min-h-screen bg-neutral-100 dark:bg-[#111] text-neutral-900 dark:text-neutral-100 p-6 flex flex-col">
                {/* Header */}
                <header className="flex justify-between items-center mb-8 max-w-4xl mx-auto w-full">
                    <button
                        onClick={() => setMode('list')}
                        className="text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition font-bold text-sm"
                    >
                        ✕ Close
                    </button>
                    <div className="text-center">
                        <h1 className="font-bold text-lg dark:text-white/90">{deck.title}</h1>
                        <p className="text-xs text-neutral-400 font-mono mt-1">
                            {currentIndex + 1} / {deck.words.length}
                        </p>
                    </div>
                    <div className="w-12"></div>
                </header>

                {/* Main Card Area */}
                <main className="flex-1 flex flex-col items-center justify-center perspective-1000 w-full max-w-2xl mx-auto">
                    <div
                        className="relative w-full aspect-[4/3] sm:aspect-[3/2] cursor-pointer group"
                        onClick={() => setIsFlipped(!isFlipped)}
                    >
                        <div
                            className={`absolute inset-0 w-full h-full duration-500 preserve-3d transition-transform ${isFlipped ? "rotate-y-180" : ""
                                }`}
                        >
                            {/* Front */}
                            <div className="absolute inset-0 backface-hidden bg-white dark:bg-[#1e1e1e] rounded-3xl shadow-xl flex flex-col items-center justify-center p-8 border border-neutral-200 dark:border-neutral-800">
                                <span className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-4">Word</span>
                                <h2 className="text-5xl sm:text-6xl font-black text-center mb-4" style={{ fontFamily: 'var(--font-merriweather)' }}>
                                    {currentCard.word}
                                </h2>
                                {currentCard.partOfSpeech && (
                                    <span className="px-3 py-1 bg-neutral-100 dark:bg-neutral-800 text-neutral-500 rounded-full text-sm font-medium">
                                        {currentCard.partOfSpeech}
                                    </span>
                                )}
                                <p className="absolute bottom-8 text-neutral-300 dark:text-neutral-600 text-xs font-bold animate-pulse">
                                    Click to flip ↻
                                </p>
                            </div>

                            {/* Back */}
                            <div className="absolute inset-0 backface-hidden rotate-y-180 bg-indigo-600 dark:bg-indigo-900 text-white rounded-3xl shadow-xl flex flex-col items-center justify-center p-8 sm:p-12 text-center">
                                <span className="text-xs font-bold text-indigo-200 uppercase tracking-widest mb-6 border-b border-indigo-400/30 pb-1">Meaning</span>
                                <h3 className="text-3xl sm:text-4xl font-bold mb-8" style={{ fontFamily: 'var(--font-noto-serif-jp)' }}>
                                    {currentCard.meaning}
                                </h3>

                                <div className="w-full bg-black/10 rounded-xl p-6 text-left">
                                    <p className="text-lg italic font-serif mb-2 text-indigo-50">"{currentCard.example}"</p>
                                    <p className="text-sm text-indigo-200 font-light" style={{ fontFamily: 'var(--font-noto-serif-jp)' }}>
                                        {currentCard.example_jp}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Controls */}
                    <div className="flex items-center gap-6 mt-12 w-full max-w-sm justify-between">
                        <button
                            onClick={handlePrev}
                            disabled={currentIndex === 0}
                            className={`p-4 rounded-full transition-all ${currentIndex === 0
                                    ? "text-neutral-300 cursor-not-allowed"
                                    : "bg-white dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 shadow-lg hover:scale-110 active:scale-95"
                                }`}
                        >
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
                        </button>

                        <span className="text-sm font-bold text-neutral-400 uppercase tracking-widest">
                            {isFlipped ? "Back" : "Front"}
                        </span>

                        <button
                            onClick={handleNext}
                            className="p-4 rounded-full bg-indigo-600 text-white shadow-lg shadow-indigo-500/30 hover:bg-indigo-700 hover:scale-110 transition-all active:scale-95"
                        >
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
                        </button>
                    </div>
                </main>

                <style jsx global>{`
            .perspective-1000 { perspective: 1000px; }
            .preserve-3d { transform-style: preserve-3d; }
            .backface-hidden { backface-visibility: hidden; }
            .rotate-y-180 { transform: rotateY(180deg); }
          `}</style>
            </div>
        );
    }

    // --- デフォルト：リストモードの表示 ---
    return (
        <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 p-6 sm:p-12 font-sans transition-colors duration-300">
            <header className="max-w-4xl mx-auto flex items-center justify-between mb-8">
                <Link href="/" className="px-4 py-2 text-sm font-bold text-neutral-500 hover:bg-neutral-200 dark:hover:bg-neutral-800 rounded-lg transition-colors">
                    ← Back to Home
                </Link>
            </header>

            <main className="max-w-4xl mx-auto">
                {/* Cover / Info */}
                <div className="bg-white dark:bg-neutral-900 rounded-3xl p-8 sm:p-12 shadow-sm border border-neutral-200 dark:border-neutral-800 mb-8 text-center sm:text-left flex flex-col sm:flex-row items-center justify-between gap-6">
                    <div>
                        <h1 className="text-3xl sm:text-4xl font-black mb-2" style={{ fontFamily: 'var(--font-merriweather)' }}>{deck.title}</h1>
                        <p className="text-neutral-500 font-mono">{deck.words.length} items</p>
                    </div>
                    <button
                        onClick={() => {
                            handleRestart();
                            setMode('flashcard');
                        }}
                        className="px-8 py-4 bg-indigo-600 text-white text-lg font-bold rounded-full shadow-lg hover:bg-indigo-700 hover:shadow-indigo-500/30 hover:-translate-y-1 transition-all active:scale-95 flex items-center gap-3"
                    >
                        <span className="text-2xl">▶</span> Start Flashcards
                    </button>
                </div>

                {/* Word List */}
                <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/50 flex items-center justify-between">
                        <h2 className="font-bold text-neutral-400 uppercase tracking-widest text-sm">Word List</h2>
                    </div>
                    {deck.words.map((card, idx) => (
                        <div key={idx} className="p-6 border-b border-neutral-100 dark:border-neutral-800 last:border-0 hover:bg-neutral-50 dark:hover:bg-neutral-800/30 transition-colors flex flex-col sm:flex-row gap-4 sm:items-baseline">
                            <div className="flex items-baseline gap-3 min-w-[200px]">
                                <span className="text-lg font-bold font-serif" style={{ fontFamily: 'var(--font-merriweather)' }}>{card.word}</span>
                                {card.partOfSpeech && (
                                    <span className="text-xs bg-neutral-100 dark:bg-neutral-800 px-2 py-0.5 rounded text-neutral-500 font-medium">{card.partOfSpeech}</span>
                                )}
                            </div>
                            <div className="flex-1">
                                <div className="font-medium text-neutral-800 dark:text-neutral-200 mb-1" style={{ fontFamily: 'var(--font-noto-serif-jp)' }}>{card.meaning}</div>
                                <div className="text-sm text-neutral-500 italic">"{card.example}"</div>
                            </div>
                        </div>
                    ))}
                </div>
            </main>
        </div>
    );
}
