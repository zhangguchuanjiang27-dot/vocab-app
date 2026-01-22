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
    otherExamples?: { role: string; text: string; translation: string }[];
    synonyms?: string[];
    antonyms?: string[];
    isUnlocked?: boolean;
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
    const [showExamples, setShowExamples] = useState(false); // フラッシュカード用例文表示
    const [isRandomMode, setIsRandomMode] = useState(false);
    const [shuffledWords, setShuffledWords] = useState<WordCard[]>([]);

    // List Item Detail State
    const [expandedWordId, setExpandedWordId] = useState<string | null>(null);

    // Title edit state
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [editTitle, setEditTitle] = useState("");

    // Sort & Filter
    const [sortKey, setSortKey] = useState<'created_desc' | 'created_asc' | 'pos'>('created_asc');

    // Selection & Batch Move
    const [selectedWords, setSelectedWords] = useState<Set<string>>(new Set());
    const [myDecks, setMyDecks] = useState<Deck[]>([]);
    const [showMoveModal, setShowMoveModal] = useState(false);

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

                // 埋め込まれた追加例文とアンロック情報のパース処理
                const processedWords = data.words.map((w: WordCard) => {
                    let cleanExampleJp = w.example_jp || "";
                    let isUnlocked = false;
                    let otherExamples = w.otherExamples || [];
                    let synonyms = w.synonyms || [];
                    let antonyms = w.antonyms || [];

                    // 1. アンロックマーカーのチェック
                    if (cleanExampleJp.includes('|||UNLOCKED|||')) {
                        isUnlocked = true;
                        cleanExampleJp = cleanExampleJp.replace('|||UNLOCKED|||', '');
                    }

                    // 2. 追加例文マーカーのチェック
                    if (cleanExampleJp.includes('|||EXT|||')) {
                        const parts = cleanExampleJp.split('|||EXT|||');
                        cleanExampleJp = parts[0];
                        try {
                            const parsed = JSON.parse(parts[1]);
                            if (Array.isArray(parsed)) {
                                otherExamples = parsed;
                            } else if (parsed.examples) {
                                otherExamples = parsed.examples;
                                synonyms = parsed.synonyms || [];
                                antonyms = parsed.antonyms || [];
                            }
                        } catch (e) {
                            // パースエラー時はそのまま
                        }
                    }

                    return {
                        ...w,
                        example_jp: cleanExampleJp,
                        otherExamples: otherExamples,
                        synonyms: synonyms,
                        antonyms: antonyms,
                        isUnlocked: isUnlocked
                    };
                });

                setDeck({ ...data, words: processedWords });
                setEditTitle(data.title);
            } else {
                alert("単語帳の読み込みに失敗しました");
                router.push("/");
            }
        } catch (e) {
            console.error(e);
            alert("読み込みエラー");
        } finally {
            setLoading(false);
        }
    };

    const handleUnlock = async (wordId: string) => {
        if (!confirm("2コインを使って例文をアンロックしますか？")) return;

        try {
            const res = await fetch(`/api/words/${wordId}/unlock`, { method: "POST" });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "Failed to unlock");
            }

            // 成功したらローカルのstateを更新
            if (deck) {
                const updatedWords = deck.words.map(w => {
                    if (w.id === wordId) {
                        return { ...w, isUnlocked: true };
                    }
                    return w;
                });
                setDeck({ ...deck, words: updatedWords });
                // alert("アンロックしました！");
            }
        } catch (e: any) {
            alert(e.message);
        }
    };

    const handleGenerateDetails = async (wordId: string) => {
        if (!confirm("1コインを使ってAIで詳細（例文・類義語・対義語）を生成しますか？")) return;

        try {
            const res = await fetch(`/api/words/${wordId}/generate-details`, { method: "POST" });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "Failed to generate");
            }

            const data = await res.json();

            // 成功したらローカルのstateを更新
            if (deck) {
                const updatedWords = deck.words.map(w => {
                    if (w.id === wordId) {
                        return {
                            ...w,
                            otherExamples: data.generatedContent.examples,
                            synonyms: data.generatedContent.synonyms,
                            antonyms: data.generatedContent.antonyms,
                            isUnlocked: true // 生成したら即座に見えるようにする
                        };
                    }
                    return w;
                });
                setDeck({ ...deck, words: updatedWords });
                alert("生成しました！");
            }
        } catch (e: any) {
            alert(e.message);
        }
    };

    const fetchMyDecks = async () => {
        try {
            const res = await fetch("/api/decks");
            if (res.ok) {
                const data = await res.json();
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
                alert("タイトルの更新に失敗しました");
            }
        } catch (e) {
            console.error(e);
            alert("タイトル更新エラー");
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
                // 選択状態からも削除
                const newSet = new Set(selectedWords);
                newSet.delete(wordId);
                setSelectedWords(newSet);
            } else {
                alert("削除に失敗しました");
            }
        } catch (e) {
            console.error(e);
            alert("エラーが発生しました");
        }
    };

    // 選択ロジック
    const toggleSelect = (id: string) => {
        const newSet = new Set(selectedWords);
        if (newSet.has(id)) {
            newSet.delete(id);
        } else {
            newSet.add(id);
        }
        setSelectedWords(newSet);
    };

    const toggleSelectAll = () => {
        if (!deck) return;
        if (selectedWords.size === deck.words.length) {
            setSelectedWords(new Set());
        } else {
            const allIds = deck.words.map(w => w.id).filter((id): id is string => !!id);
            setSelectedWords(new Set(allIds));
        }
    };

    // 一括移動実行
    const handleBatchMove = async (targetDeckId: string) => {
        if (selectedWords.size === 0 || !deck) return;

        try {
            const res = await fetch(`/api/words/batch`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    wordIds: Array.from(selectedWords),
                    targetDeckId
                })
            });

            if (res.ok) {
                // 現在のリストから削除
                setDeck({
                    ...deck,
                    words: deck.words.filter(w => w.id && !selectedWords.has(w.id))
                });
                setShowMoveModal(false);
                setSelectedWords(new Set());
                alert(`${selectedWords.size} 語を移動しました！`);
            } else {
                alert("移動に失敗しました");
            }
        } catch (e) {
            console.error(e);
            alert("エラーが発生しました");
        }
    };

    // 一括削除実行
    const handleBatchDelete = async () => {
        if (selectedWords.size === 0 || !deck) return;
        if (!confirm(`本当に ${selectedWords.size} 個の単語を削除しますか？この操作は取り消せません。`)) return;

        try {
            const res = await fetch(`/api/words/batch`, {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    wordIds: Array.from(selectedWords)
                })
            });

            if (res.ok) {
                // 現在のリストから削除
                setDeck({
                    ...deck,
                    words: deck.words.filter(w => w.id && !selectedWords.has(w.id))
                });
                setSelectedWords(new Set());
                alert("削除しました");
            } else {
                alert("削除に失敗しました");
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
        const words = isRandomMode ? shuffledWords : deck.words;
        setIsFlipped(false);
        setShowExamples(false);
        if (currentIndex < words.length - 1) {
            setTimeout(() => setCurrentIndex((prev) => prev + 1), 150);
        } else {
            setIsFinished(true);
        }
    };

    const handlePrev = () => {
        if (currentIndex > 0) {
            setIsFlipped(false);
            setShowExamples(false);
            setTimeout(() => setCurrentIndex((prev) => prev - 1), 150);
        }
    };

    const handleRestart = () => {
        setIsFinished(false);
        setCurrentIndex(0);
        setIsFlipped(false);
        setShowExamples(false); // Reset example visibility
    };

    // シャッフル機能
    const shuffleArray = (array: WordCard[]): WordCard[] => {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    };

    const toggleRandomMode = () => {
        if (!isRandomMode && deck) {
            // ランダムモードに切り替え
            setShuffledWords(shuffleArray(deck.words));
            setIsRandomMode(true);
        } else {
            // 通常モードに切り替え
            setIsRandomMode(false);
        }
        setCurrentIndex(0);
        setIsFlipped(false);
        setShowExamples(false);
    };

    // --- 音声読み上げ ---
    const speak = (text: string) => {
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
            // キャンセルして重複再生を防ぐ
            window.speechSynthesis.cancel();

            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'en-US'; // 英語（米国）
            utterance.rate = 1.0; // 速度
            // 必要なら voice を選ぶ処理も追加できるが、デフォルトでも十分
            window.speechSynthesis.speak(utterance);
        }
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

        const displayWords = isRandomMode ? shuffledWords : deck.words;
        const currentCard = displayWords[currentIndex];

        return (
            <div className="min-h-screen bg-neutral-100 dark:bg-[#111] text-neutral-900 dark:text-neutral-100 p-6 flex flex-col">
                <header className="flex justify-between items-center mb-8 max-w-4xl mx-auto w-full">
                    <button onClick={() => setMode('list')} className="text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition font-bold text-sm">✕ 閉じる</button>
                    <div className="text-center">
                        <h1 className="font-bold text-lg dark:text-white/90">{deck.title}</h1>
                        <p className="text-xs text-neutral-400 font-mono mt-1">{currentIndex + 1} / {deck.words.length}</p>
                    </div>
                    <button
                        onClick={toggleRandomMode}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${isRandomMode
                            ? 'bg-indigo-600 text-white'
                            : 'bg-neutral-200 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-300'
                            }`}
                    >
                        🔀 {isRandomMode ? 'ランダム' : '順序'}
                    </button>
                </header>

                <main className="flex-1 flex flex-col items-center justify-center perspective-1000 w-full max-w-2xl mx-auto">
                    <div className="relative w-full aspect-[4/3] sm:aspect-[3/2] cursor-pointer group" onClick={() => setIsFlipped(!isFlipped)}>
                        <div className={`absolute inset-0 w-full h-full duration-500 preserve-3d transition-transform ${isFlipped ? "rotate-y-180" : ""}`}>
                            {/* Front */}
                            <div className="absolute inset-0 backface-hidden bg-white dark:bg-[#1e1e1e] rounded-3xl shadow-xl flex flex-col items-center justify-center p-8 border border-neutral-200 dark:border-neutral-800">
                                <span className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-4">単語</span>
                                <div className="flex items-center gap-3">
                                    <h2 className="text-5xl sm:text-6xl font-black text-center mb-0" style={{ fontFamily: 'var(--font-merriweather)' }}>{currentCard.word}</h2>
                                    {/* 音声再生ボタン (Front) */}
                                    <button
                                        onClick={(e) => { e.stopPropagation(); speak(currentCard.word); }}
                                        className="p-3 bg-neutral-100 dark:bg-neutral-800 rounded-full hover:bg-indigo-100 dark:hover:bg-indigo-900 text-indigo-500 transition-colors"
                                    >
                                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
                                    </button>
                                </div>
                                {currentCard.partOfSpeech && <span className="mt-4 px-3 py-1 bg-neutral-100 dark:bg-neutral-800 text-neutral-500 rounded-full text-sm font-medium">{currentCard.partOfSpeech}</span>}
                                <p className="absolute bottom-8 text-neutral-300 dark:text-neutral-600 text-xs font-bold animate-pulse">クリックして反転 ↻</p>
                            </div>
                            {/* Back */}
                            <div className="absolute inset-0 backface-hidden rotate-y-180 bg-indigo-600 dark:bg-indigo-900 text-white rounded-3xl shadow-xl flex flex-col items-center justify-center p-8 sm:p-12 text-center">
                                <span className="text-xs font-bold text-indigo-200 uppercase tracking-widest mb-6 border-b border-indigo-400/30 pb-1">意味</span>
                                <h3 className="text-3xl sm:text-4xl font-bold mb-8" style={{ fontFamily: 'var(--font-noto-serif-jp)' }}>{currentCard.meaning}</h3>

                                {/* 例文セクション (トグル式) */}
                                {!showExamples ? (
                                    currentCard.isUnlocked ? (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setShowExamples(true); }}
                                            className="px-6 py-2 bg-white/20 hover:bg-white/30 rounded-full text-sm font-bold border border-white/30 backdrop-blur-sm transition-all"
                                        >
                                            例文を見る
                                        </button>
                                    ) : (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (currentCard.id) handleUnlock(currentCard.id);
                                            }}
                                            className="px-6 py-2 bg-amber-400 hover:bg-amber-300 text-amber-900 rounded-full text-sm font-bold shadow-lg transition-all flex items-center gap-2"
                                        >
                                            <span>🔒</span> 例文をアンロック (2コイン)
                                        </button>
                                    )
                                ) : (
                                    <div className="w-full bg-black/10 rounded-xl p-6 text-left relative animate-in fade-in duration-300 max-h-[200px] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                                        <div className="mb-4 last:mb-0">
                                            <div className="flex gap-2 items-start">
                                                <button onClick={() => speak(currentCard.example)} className="mt-1 p-1 bg-white/20 rounded-full hover:bg-white/40 shrink-0"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg></button>
                                                <div>
                                                    <p className="text-lg italic font-serif text-indigo-50 leading-tight">"{currentCard.example}"</p>
                                                    <p className="text-sm text-indigo-200 font-light mt-1">{currentCard.example_jp}</p>
                                                </div>
                                            </div>
                                        </div>
                                        {currentCard.otherExamples?.map((ex, i) => (
                                            <div key={i} className="mb-4 last:mb-0 border-t border-white/10 pt-4">
                                                <span className="text-[10px] uppercase font-bold text-indigo-200 opacity-70 mb-1 block">{ex.role}</span>
                                                <div className="flex gap-2 items-start">
                                                    <button onClick={() => speak(ex.text)} className="mt-1 p-1 bg-white/20 rounded-full hover:bg-white/40 shrink-0"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg></button>
                                                    <div>
                                                        <p className="text-base italic font-serif text-indigo-50 leading-tight">"{ex.text}"</p>
                                                        <p className="text-xs text-indigo-200 font-light mt-1">{ex.translation}</p>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}

                                        {/* 類義語・対義語セクション */}
                                        {(currentCard.synonyms?.length || 0) > 0 || (currentCard.antonyms?.length || 0) > 0 ? (
                                            <div className="mt-4 pt-4 border-t border-white/10 space-y-3">
                                                {currentCard.synonyms && currentCard.synonyms.length > 0 && (
                                                    <div>
                                                        <span className="text-[10px] uppercase font-bold text-indigo-200 opacity-70">類義語</span>
                                                        <div className="flex flex-wrap gap-2 mt-1">
                                                            {currentCard.synonyms.map((syn, i) => (
                                                                <span key={i} className="px-2.5 py-1 text-xs bg-white/10 rounded-full text-indigo-100 font-medium">
                                                                    {syn}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                                {currentCard.antonyms && currentCard.antonyms.length > 0 && (
                                                    <div>
                                                        <span className="text-[10px] uppercase font-bold text-red-200 opacity-70">対義語</span>
                                                        <div className="flex flex-wrap gap-2 mt-1">
                                                            {currentCard.antonyms.map((ant, i) => (
                                                                <span key={i} className="px-2.5 py-1 text-xs bg-red-500/20 rounded-full text-red-100 font-medium">
                                                                    {ant}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        ) : null}
                                    </div>
                                )}
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
        <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 p-6 sm:p-12 font-sans transition-colors duration-300 pb-24">

            {/* Move Modal */}
            {showMoveModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-white dark:bg-neutral-900 w-full max-w-sm rounded-2xl p-6 shadow-2xl border border-neutral-200 dark:border-neutral-800">
                        <h3 className="text-lg font-bold mb-4">Move {selectedWords.size} words to...</h3>
                        <div className="max-h-[300px] overflow-y-auto flex flex-col gap-2 mb-4">
                            {myDecks.length === 0 ? (
                                <p className="text-neutral-500 text-sm">移動先の単語帳がありません</p>
                            ) : (
                                myDecks.map(d => (
                                    <button
                                        key={d.id}
                                        onClick={() => handleBatchMove(d.id)}
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

            {/* Bulk Action Bar (Floating) */}
            {selectedWords.size > 0 && (
                <div className="fixed bottom-6 left-0 right-0 mx-auto w-max z-40 animate-in slide-in-from-bottom-4 fade-in">
                    <div className="bg-neutral-900 dark:bg-white text-white dark:text-black px-6 py-3 rounded-full shadow-xl flex items-center gap-4">
                        <span className="font-bold text-sm">{selectedWords.size} 件選択中</span>
                        <div className="h-4 w-px bg-white/20 dark:bg-black/20"></div>
                        <button
                            onClick={() => setShowMoveModal(true)}
                            className="font-bold text-sm hover:text-indigo-400 dark:hover:text-indigo-600 transition-colors"
                        >
                            移動
                        </button>
                        <button
                            onClick={handleBatchDelete}
                            className="font-bold text-sm text-red-400 hover:text-red-300 dark:text-red-600 dark:hover:text-red-500 transition-colors"
                        >
                            削除
                        </button>

                        <div className="h-4 w-px bg-white/20 dark:bg-black/20"></div>

                        <button
                            onClick={() => setSelectedWords(new Set())}
                            className="ml-2 text-xs opacity-50 hover:opacity-100"
                        >
                            キャンセル
                        </button>
                    </div>
                </div>
            )}

            <header className="max-w-4xl mx-auto flex items-center justify-between mb-8">
                <Link href="/" className="px-4 py-2 text-sm font-bold text-neutral-500 hover:bg-neutral-200 dark:hover:bg-neutral-800 rounded-lg transition-colors">← ホームに戻る</Link>
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
                                <button onClick={handleUpdateTitle} className="px-4 py-2 bg-indigo-600 text-white font-bold rounded-lg text-sm shrink-0">保存</button>
                                <button onClick={() => setIsEditingTitle(false)} className="px-4 py-2 bg-neutral-200 dark:bg-neutral-800 font-bold rounded-lg text-sm shrink-0">キャンセル</button>
                            </div>
                        ) : (
                            <h1 className="text-3xl sm:text-4xl font-black mb-2 group cursor-pointer flex items-center gap-3 justify-center sm:justify-start" onClick={() => setIsEditingTitle(true)}>
                                <span style={{ fontFamily: 'var(--font-merriweather)' }}>{deck.title}</span>
                                <span className="opacity-0 group-hover:opacity-100 text-neutral-400 text-sm">✎</span>
                            </h1>
                        )}
                        <p className="text-neutral-500 font-mono">{deck.words.length} 語</p>
                    </div>

                    {deck.words.length > 0 && (
                        <button onClick={() => { handleRestart(); setMode('flashcard'); }} className="px-8 py-4 bg-indigo-600 text-white text-lg font-bold rounded-full shadow-lg hover:bg-indigo-700 hover:shadow-indigo-500/30 hover:-translate-y-1 transition-all active:scale-95 flex items-center gap-3">
                            <span className="text-2xl">▶</span> 学習スタート
                        </button>
                    )}
                </div>

                {/* Word List */}
                <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/50 flex flex-col sm:flex-row items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <input
                                type="checkbox"
                                checked={deck.words.length > 0 && selectedWords.size === deck.words.length}
                                onChange={toggleSelectAll}
                                className="w-5 h-5 rounded border-neutral-300 accent-indigo-600 cursor-pointer"
                            />
                            <h2 className="font-bold text-neutral-400 uppercase tracking-widest text-sm">全選択</h2>
                        </div>

                        {/* Sort Controls */}
                        <div className="flex items-center gap-2 text-sm">
                            <span className="text-neutral-500 font-bold text-xs uppercase">並び替え:</span>
                            <select
                                value={sortKey}
                                onChange={(e) => setSortKey(e.target.value as any)}
                                className="bg-white dark:bg-black border border-neutral-200 dark:border-neutral-700 rounded-lg px-2 py-1 font-bold focus:outline-none"
                            >
                                <option value="created_asc">作成順 (古い順)</option>
                                <option value="created_desc">作成順 (新しい順)</option>
                                <option value="pos">品詞順</option>
                            </select>
                        </div>
                    </div>

                    {sortedWords.length === 0 ? (
                        <div className="p-12 text-center text-neutral-400">単語がありません。ホーム画面から追加してください。</div>
                    ) : (
                        sortedWords.map((card, idx) => (
                            <div
                                key={card.id || idx}
                                className={`group p-6 border-b border-neutral-100 dark:border-neutral-800 last:border-0 hover:bg-neutral-50 dark:hover:bg-neutral-800/30 transition-colors flex gap-4 items-start relative
                                ${card.id && selectedWords.has(card.id) ? "bg-indigo-50/50 dark:bg-indigo-900/10" : ""}`}
                            >
                                <div className="pt-2">
                                    <input
                                        type="checkbox"
                                        checked={!!(card.id && selectedWords.has(card.id))}
                                        onChange={() => card.id && toggleSelect(card.id)}
                                        className="w-5 h-5 rounded border-neutral-300 accent-indigo-600 cursor-pointer"
                                    />
                                </div>

                                <div className="flex-1 flex flex-col sm:flex-row gap-4 sm:items-baseline pr-12">
                                    <div className="flex flex-wrap items-baseline gap-2 sm:gap-3 min-w-[120px] sm:min-w-[200px]">
                                        <div className="flex items-center gap-2">
                                            <span className="text-lg font-bold font-serif break-all" style={{ fontFamily: 'var(--font-merriweather)' }}>{card.word}</span>
                                            <button
                                                onClick={() => speak(card.word)}
                                                className="p-1.5 text-neutral-300 hover:text-indigo-500 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                                            >
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
                                            </button>
                                        </div>
                                        {card.partOfSpeech && (
                                            <span className="text-xs bg-neutral-200 dark:bg-neutral-800 px-2 py-0.5 rounded text-neutral-600 dark:text-neutral-400 font-bold whitespace-nowrap self-center sm:self-auto">
                                                {card.partOfSpeech}
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex-1">
                                        <div className="font-medium text-neutral-800 dark:text-neutral-200 mb-2" style={{ fontFamily: 'var(--font-noto-serif-jp)' }}>{card.meaning}</div>
                                        <div className="space-y-1">
                                            {/* 例文セクション (ロック機能付き) */}
                                            {card.isUnlocked ? (
                                                <div className="space-y-3">
                                                    {/* メイン例文 */}
                                                    <div>
                                                        <div className="flex items-start gap-2">
                                                            <button
                                                                onClick={() => speak(card.example)}
                                                                className="mt-0.5 p-1 text-neutral-300 hover:text-indigo-500 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors shrink-0"
                                                                title="Play example"
                                                            >
                                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
                                                            </button>
                                                            <div className="text-sm text-neutral-600 dark:text-neutral-300 italic">"{card.example}"</div>
                                                        </div>
                                                        <div className="text-xs text-neutral-400 font-light pl-7" style={{ fontFamily: 'var(--font-noto-serif-jp)' }}>{card.example_jp}</div>
                                                    </div>

                                                    {/* 追加の例文表示 (リスト表示) */}
                                                    {card.otherExamples && card.otherExamples.length > 0 && (
                                                        <div className="pl-2 border-l-2 border-indigo-100 dark:border-neutral-800 space-y-3 animate-in fade-in">
                                                            {card.otherExamples.map((ex, i) => (
                                                                <div key={i} className="text-sm">
                                                                    <div className="flex items-center gap-2 mb-1">
                                                                        <span className="text-[10px] bg-neutral-200 dark:bg-neutral-800 px-1.5 rounded text-neutral-500 font-bold">{ex.role}</span>
                                                                        <button onClick={() => speak(ex.text)} className="text-neutral-300 hover:text-indigo-500"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg></button>
                                                                    </div>
                                                                    <div className="text-neutral-600 dark:text-neutral-400 italic mb-0.5">"{ex.text}"</div>
                                                                    <div className="text-xs text-neutral-400 font-light">{ex.translation}</div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}

                                                    {/* もし追加例文がなく、AI生成したい場合 */}
                                                    {(!card.otherExamples || card.otherExamples.length === 0) && (
                                                        <button
                                                            onClick={() => card.id && handleGenerateDetails(card.id)}
                                                            className="text-xs font-bold text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 flex items-center gap-1 mt-2"
                                                        >
                                                            <span>✨</span> 他の意味の例文もAIで生成 (1コイン)
                                                        </button>
                                                    )}
                                                </div>
                                            ) : (
                                                <button
                                                    onClick={() => card.id && handleUnlock(card.id)}
                                                    className="mt-2 text-xs font-bold text-amber-500 hover:text-amber-600 flex items-center gap-1 px-3 py-1.5 bg-amber-50 dark:bg-amber-900/10 rounded-full w-fit"
                                                >
                                                    <span>🔒</span> 例文を表示 (2コイン)
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Delete Button */}
                                <button
                                    onClick={() => handleDeleteWord(card.id)}
                                    className="absolute top-4 right-4 text-neutral-300 hover:text-red-500 bg-white/50 dark:bg-black/50 sm:bg-transparent rounded-full p-2 opacity-0 group-hover:opacity-100 transition-opacity"
                                    title="Remove word"
                                >
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg>
                                </button>
                            </div>
                        ))
                    )}
                </div>
            </main>
        </div>
    );
}
