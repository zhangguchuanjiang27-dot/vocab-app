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

    // モード管理: 'list' (一覧) | 'flashcard' (学習) | 'writing_test' (テスト)
    const [mode, setMode] = useState<'list' | 'flashcard' | 'writing_test'>('list');

    // Writing Test State
    const [writingInput, setWritingInput] = useState("");
    const [isAnswerChecked, setIsAnswerChecked] = useState(false);
    const [isCorrect, setIsCorrect] = useState<boolean | null>(null);

    // Flashcard state
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isFlipped, setIsFlipped] = useState(false);
    const [isFinished, setIsFinished] = useState(false);
    const [showExamples, setShowExamples] = useState(false); // フラッシュカード用例文表示
    const [isRandomMode, setIsRandomMode] = useState(false);
    const [shuffledWords, setShuffledWords] = useState<WordCard[]>([]);
    const [wrongWordIds, setWrongWordIds] = useState<Set<string>>(new Set());
    const [reviewWords, setReviewWords] = useState<WordCard[] | null>(null); // null means normal mode

    // List Item Detail State
    const [expandedListItems, setExpandedListItems] = useState<Record<string, boolean>>({});

    const toggleExampleVisibility = (id: string) => {
        setExpandedListItems(prev => ({
            ...prev,
            [id]: !prev[id]
        }));
    };

    const toggleWrongWord = (id: string, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        setWrongWordIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    // Title edit state
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [editTitle, setEditTitle] = useState("");

    // Sort & Filter
    const [sortKey, setSortKey] = useState<'created_desc' | 'created_asc' | 'pos'>('created_asc');

    // Selection State
    const [selectedWordIds, setSelectedWordIds] = useState<Set<string>>(new Set());
    const [isSelectionMode, setIsSelectionMode] = useState(false);

    const toggleSelectWord = (id: string) => {
        const newResult = new Set(selectedWordIds);
        if (newResult.has(id)) newResult.delete(id);
        else newResult.add(id);
        setSelectedWordIds(newResult);
    };

    const handleSelectAll = () => {
        // 現在のソート済みリストを基準に全選択/解除
        const allIds = getSortedWords().map(w => w.id).filter(Boolean) as string[];

        // すてに全て選択されていれば解除、そうでなければ全選択
        const isAllSelected = allIds.length > 0 && allIds.every(id => selectedWordIds.has(id));

        if (isAllSelected) {
            setSelectedWordIds(new Set());
        } else {
            setSelectedWordIds(new Set(allIds));
        }
    };

    const handleBulkDelete = async () => {
        if (!deck || selectedWordIds.size === 0) return;
        if (!confirm(`${selectedWordIds.size} 件の単語を削除しますか？`)) return;

        setLoading(true);
        try {
            const idsToDelete = Array.from(selectedWordIds);
            for (const id of idsToDelete) {
                const res = await fetch(`/api/words/${id}`, { method: "DELETE" });
                if (!res.ok) console.error(`Failed to delete ${id}`);
            }
            // Update local state
            setDeck({
                ...deck,
                words: deck.words.filter(w => !selectedWordIds.has(w.id || ""))
            });
            setSelectedWordIds(new Set());
            alert("削除が完了しました");
        } catch (e) {
            console.error(e);
            alert("削除中にエラーが発生しました");
        } finally {
            setLoading(false);
        }
    };



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

                // 埋め込まれた追加例文とアンロック情報のパース処理
                const rawWords = Array.isArray(data.words) ? data.words : [];
                const processedWords = rawWords
                    .filter((w: any) => w && typeof w === 'object') // Filter out falsy/null items first
                    .map((w: WordCard) => {
                        // Force string conversion for safety
                        let cleanExampleJp = String(w.example_jp || "");
                        let isUnlocked = false;

                        // Safety: Ensure these are arrays
                        let otherExamples: any[] = Array.isArray(w.otherExamples) ? w.otherExamples : [];


                        // 1. アンロックマーカーのチェック (表示上は除去するが、ロック機能は廃止)
                        if (cleanExampleJp.includes('|||UNLOCKED|||')) {
                            cleanExampleJp = cleanExampleJp.replace('|||UNLOCKED|||', '');
                        }

                        // 2. 追加例文マーカーのチェック
                        if (cleanExampleJp.includes('|||EXT|||')) {
                            const parts = cleanExampleJp.split('|||EXT|||');
                            cleanExampleJp = parts[0] || "";
                            try {
                                const parsed = JSON.parse(parts[1]);
                                if (Array.isArray(parsed)) {
                                    otherExamples = parsed;
                                } else if (parsed && typeof parsed === 'object') {
                                    if (parsed.examples && Array.isArray(parsed.examples)) {
                                        otherExamples = parsed.examples;
                                    }
                                    if (parsed.examples && Array.isArray(parsed.examples)) {
                                        otherExamples = parsed.examples;
                                    }
                                }
                            } catch (e) {
                                // パースエラー時はそのまま
                                console.warn("Failed to parse extended data", e);
                            }
                        }

                        // Clean otherExamples to match expected structure and ensure safe rendering
                        const safeOtherExamples = otherExamples.map((ex: any) => {
                            if (!ex || typeof ex !== 'object') return null;
                            return {
                                role: String(ex.role || ''),
                                text: String(ex.text || ''),
                                translation: String(ex.translation || '')
                            };
                        }).filter(Boolean) as { role: string; text: string; translation: string }[];

                        return {
                            ...w,
                            word: String(w.word || ""),
                            meaning: String(w.meaning || ""),
                            example: String(w.example || ""),
                            partOfSpeech: w.partOfSpeech ? String(w.partOfSpeech) : undefined,
                            example_jp: cleanExampleJp,
                            otherExamples: safeOtherExamples,

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

    const handleGenerateDetails = async (wordId: string) => {
        // コイン消費なしで生成
        try {
            const res = await fetch(`/api/words/${wordId}/generate-details`, { method: "POST" });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "Failed to generate");
            }

            // 成功したら全データを再取得
            await fetchDeck();

        } catch (e: any) {
            alert(e.message);
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
            } else {
                alert("削除に失敗しました");
            }
        } catch (e) {
            console.error(e);
            alert("エラーが発生しました");
        }
    };




    // --- Word Edit State ---
    const [editingWordId, setEditingWordId] = useState<string | null>(null);
    const [editFormData, setEditFormData] = useState({
        word: "",
        meaning: "",
        partOfSpeech: "",
        example: "",
        example_jp: ""
    });

    const handleStartEdit = (word: WordCard) => {
        setEditingWordId(word.id || null);
        setEditFormData({
            word: word.word,
            meaning: word.meaning,
            // partOfSpeech can be undefined in type, handle safely
            partOfSpeech: word.partOfSpeech || "",
            example: word.example,
            example_jp: word.example_jp
        });
    };

    const handleCancelEdit = () => {
        setEditingWordId(null);
        setEditFormData({ word: "", meaning: "", partOfSpeech: "", example: "", example_jp: "" });
    };

    const handleSaveEdit = async () => {
        if (!editingWordId || !deck) return;

        try {
            const res = await fetch(`/api/words/${editingWordId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(editFormData)
            });

            if (res.ok) {
                const updatedWord = await res.json();

                // Update local state
                setDeck({
                    ...deck,
                    words: deck.words.map(w => {
                        if (w.id === editingWordId) {
                            // Merge the updated fields
                            return {
                                ...w,
                                ...updatedWord,
                                // ensure consistency with WordCard type
                                otherExamples: w.otherExamples
                            };
                        }
                        return w;
                    })
                });

                handleCancelEdit();
            } else {
                alert("更新に失敗しました");
            }
        } catch (e) {
            console.error(e);
            alert("更新エラーが発生しました");
        }
    };

    // ソートロジック
    const getSortedWords = () => {
        if (!deck || !Array.isArray(deck.words)) return [];
        // Filter nulls again just in case
        const words = deck.words.filter(w => w && typeof w === 'object');
        switch (sortKey) {
            case 'created_asc':
                return words.sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
            case 'created_desc':
                return words.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
            case 'pos':
                return words.sort((a, b) => String(a.partOfSpeech || '').localeCompare(String(b.partOfSpeech || '')));
            default:
                return words;
        }
    };

    const sortedWords = getSortedWords();


    const handleNext = () => {
        if (!deck) return;
        const words = reviewWords || (isRandomMode ? shuffledWords : deck.words);
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

    const handleRetryCurrentSession = () => {
        setIsFinished(false);
        setCurrentIndex(0);
        setIsFlipped(false);
        setShowExamples(false);
        setWritingInput("");
        setIsAnswerChecked(false);
        setIsCorrect(null);
        setWrongWordIds(new Set());
    };



    const handleRestart = (isReviewMistakes = false) => {
        if (isReviewMistakes && deck) {
            const missed = (isRandomMode ? shuffledWords : deck.words).filter(w => w.id && wrongWordIds.has(w.id));
            setReviewWords(missed);
        } else {
            setReviewWords(null);
            setWrongWordIds(new Set());
        }

        setIsFinished(false);
        setCurrentIndex(0);
        setIsFlipped(false);
        setShowExamples(false);
        setWritingInput("");
        setIsAnswerChecked(false);
        setIsCorrect(null);
    };

    const handleCheckAnswer = (cardId: string | undefined, correctWord: string) => {
        const input = writingInput.trim().toLowerCase();
        const expected = correctWord.trim().toLowerCase();
        const correct = input === expected;

        setIsCorrect(correct);
        setIsAnswerChecked(true);

        if (!correct && cardId) {
            setWrongWordIds(prev => new Set(prev).add(cardId));
        }

        if (correct) {
            if (cardId) {
                setWrongWordIds(prev => {
                    const next = new Set(prev);
                    next.delete(cardId);
                    return next;
                });
            }
            speak(correctWord);
        }
    };

    const handleWritingNext = () => {
        setIsAnswerChecked(false);
        setIsCorrect(null);
        setWritingInput("");
        handleNext();
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
                        <h1 className="text-3xl font-bold dark:text-white">お疲れ様でした！</h1>
                        <p className="text-neutral-500">"{deck.title}" の学習が終了しました。</p>
                        <div className="flex flex-wrap gap-4 justify-center mt-8">
                            <button onClick={() => handleRestart(false)} className="px-8 py-3 bg-indigo-600 text-white rounded-full font-bold shadow-lg hover:bg-indigo-700 transition w-full sm:w-auto">最初から学習する</button>
                            {wrongWordIds.size > 0 && (
                                <button onClick={() => handleRestart(true)} className="px-8 py-3 bg-rose-500 text-white rounded-full font-bold shadow-lg hover:bg-rose-600 transition w-full sm:w-auto flex items-center gap-2">
                                    <span>🔁</span> {wrongWordIds.size}件を復習する
                                </button>
                            )}
                            {reviewWords && wrongWordIds.size === 0 && (
                                <button onClick={handleRetryCurrentSession} className="px-8 py-3 bg-indigo-600 text-white rounded-full font-bold shadow-lg hover:bg-indigo-700 transition w-full sm:w-auto flex items-center gap-2">
                                    <span>↺</span> もう一度学習する
                                </button>
                            )}
                            <button onClick={() => setMode('list')} className="px-8 py-3 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-full font-bold hover:bg-neutral-50 dark:hover:bg-neutral-700 transition w-full sm:w-auto">単語一覧に戻る</button>
                        </div>
                    </div>
                </div>
            );
        }

        const getSessionWords = () => {
            if (reviewWords) return reviewWords;
            return isRandomMode ? shuffledWords : deck.words;
        };

        const displayWords = getSessionWords();
        const currentCard = displayWords[currentIndex];

        if (!currentCard) {
            // Fallback if index is out of bounds or card is missing
            return (
                <div className="min-h-screen flex items-center justify-center">
                    <div className="text-neutral-500">Card not found. <button onClick={() => handleRestart()} className="underline">Restart</button></div>
                </div>
            );
        }

        return (
            <div className="min-h-screen bg-neutral-100 dark:bg-[#111] text-neutral-900 dark:text-neutral-100 p-6 flex flex-col">
                <header className="flex justify-between items-center mb-8 max-w-4xl mx-auto w-full">
                    <button onClick={() => setMode('list')} className="text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition font-bold text-sm">✕ 閉じる</button>
                    <div className="text-center">
                        <h1 className="font-bold text-lg dark:text-white/90">{reviewWords ? 'Mistake Review' : deck.title}</h1>
                        <p className="text-xs text-neutral-400 font-mono mt-1">{currentIndex + 1} / {displayWords.length}</p>
                    </div>
                    <div className="w-20"></div>
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
                            <div className="absolute inset-0 backface-hidden rotate-y-180 bg-indigo-600 dark:bg-indigo-900 text-white rounded-3xl shadow-xl flex flex-col items-center justify-center p-8 sm:p-12 text-center relative">
                                {/* Mistake Tagging */}
                                <button
                                    onClick={(e) => currentCard.id && toggleWrongWord(currentCard.id, e)}
                                    className={`absolute top-6 right-6 p-2 rounded-xl transition-all ${currentCard.id && wrongWordIds.has(currentCard.id)
                                        ? 'bg-rose-500 text-white scale-110 shadow-lg'
                                        : 'bg-white/10 text-white/40 hover:bg-white/20'
                                        }`}
                                    title="Mark as mistake"
                                >
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                                    <p className="text-[10px] mt-1 font-bold">復習リスト</p>
                                </button>

                                <span className="text-xs font-bold text-indigo-200 uppercase tracking-widest mb-6 border-b border-indigo-400/30 pb-1">意味</span>
                                <h3 className="text-3xl sm:text-4xl font-bold mb-8" style={{ fontFamily: 'var(--font-noto-serif-jp)' }}>{currentCard.meaning}</h3>

                                {/* 例文セクション (トグル式) */}
                                {!showExamples ? (
                                    currentCard.example ? (
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
                                                if (currentCard.id) handleGenerateDetails(currentCard.id);
                                            }}
                                            className="px-6 py-2 bg-amber-400 hover:bg-amber-300 text-amber-900 rounded-full text-sm font-bold shadow-lg transition-all flex items-center gap-2"
                                        >
                                            <span>🪄</span> 例文を生成
                                        </button>
                                    )
                                ) : (
                                    <div className="w-full bg-black/10 rounded-xl p-6 text-left relative animate-in fade-in duration-300 max-h-[200px] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setShowExamples(false); }}
                                            className="absolute top-2 right-2 p-1.5 text-neutral-400 hover:text-white bg-black/20 hover:bg-black/40 rounded-full transition-colors z-10"
                                            title="Close examples"
                                        >
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                        </button>
                                        <div className="mb-4 last:mb-0">
                                            {currentCard.example && (
                                                <div className="flex gap-2 items-start">
                                                    <div>
                                                        <p className="text-lg italic font-serif text-indigo-50 leading-tight">{currentCard.example}</p>
                                                        {currentCard.example_jp && <p className="text-sm text-indigo-200 font-light mt-1">{currentCard.example_jp}</p>}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                        {currentCard.otherExamples?.filter(ex => ex.text.trim() !== "").map((ex, i) => (
                                            <div key={i} className="mb-4 last:mb-0 border-t border-white/10 pt-4">
                                                <span className="text-[10px] uppercase font-bold text-indigo-200 opacity-70 mb-1 block">{ex.role}</span>
                                                <div className="flex gap-2 items-start">
                                                    <div>
                                                        <p className="text-base italic font-serif text-indigo-50 leading-tight">{ex.text}</p>
                                                        {ex.translation && <p className="text-xs text-indigo-200 font-light mt-1">{ex.translation}</p>}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}

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
                </main >
                <style jsx global>{` .perspective-1000 { perspective: 1000px; } .preserve-3d { transform-style: preserve-3d; } .backface-hidden { backface-visibility: hidden; } .rotate-y-180 { transform: rotateY(180deg); } `}</style>
            </div >
        );
    }



    // --- Writing Test Mode ---
    if (mode === 'writing_test') {
        if (isFinished) {
            return (
                <div className="min-h-screen flex flex-col items-center justify-center bg-neutral-50 dark:bg-black p-6">
                    <div className="text-center space-y-6 animate-in zoom-in duration-300">
                        <div className="text-6xl mb-4">📝</div>
                        <h1 className="text-3xl font-bold dark:text-white">テスト終了！</h1>
                        <p className="text-neutral-500">"{deck.title}" のテストが完了しました。</p>
                        <div className="flex flex-wrap gap-4 justify-center mt-8">
                            <button onClick={() => handleRestart(false)} className="px-8 py-3 bg-indigo-600 text-white rounded-full font-bold shadow-lg hover:bg-indigo-700 transition w-full sm:w-auto">最初から学習する</button>
                            {wrongWordIds.size > 0 && (
                                <button onClick={() => handleRestart(true)} className="px-8 py-3 bg-rose-500 text-white rounded-full font-bold shadow-lg hover:bg-rose-600 transition w-full sm:w-auto flex items-center gap-2">
                                    <span>🔁</span> {wrongWordIds.size}件を復習する
                                </button>
                            )}
                            {reviewWords && wrongWordIds.size === 0 && (
                                <button onClick={handleRetryCurrentSession} className="px-8 py-3 bg-indigo-600 text-white rounded-full font-bold shadow-lg hover:bg-indigo-700 transition w-full sm:w-auto flex items-center gap-2">
                                    <span>↺</span> もう一度学習する
                                </button>
                            )}
                            <button onClick={() => setMode('list')} className="px-8 py-3 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-full font-bold hover:bg-neutral-50 dark:hover:bg-neutral-700 transition w-full sm:w-auto">単語一覧に戻る</button>
                        </div>
                    </div>
                </div>
            );
        }

        const getWritingWords = () => {
            if (reviewWords) return reviewWords;
            return isRandomMode ? shuffledWords : deck.words;
        };

        const displayWords = getWritingWords();
        const currentCard = displayWords[currentIndex];

        if (!currentCard) return null;

        return (
            <div className="min-h-screen bg-neutral-100 dark:bg-[#111] text-neutral-900 dark:text-neutral-100 p-6 flex flex-col">
                <header className="flex justify-between items-center mb-8 max-w-4xl mx-auto w-full">
                    <button onClick={() => setMode('list')} className="text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition font-bold text-sm">✕ キャンセル</button>
                    <div className="text-center">
                        <h1 className="font-bold text-lg dark:text-white/90">{reviewWords ? 'Mistake Review (Writing)' : 'Writing Test'}</h1>
                        <p className="text-xs text-neutral-400 font-mono mt-1">{currentIndex + 1} / {displayWords.length}</p>
                    </div>
                    <div className="w-20"></div>
                </header>

                <main className="flex-1 flex flex-col items-center justify-center w-full max-w-2xl mx-auto">
                    <div className="w-full bg-white dark:bg-[#1e1e1e] rounded-3xl shadow-xl p-8 sm:p-12 border border-neutral-200 dark:border-neutral-800 flex flex-col items-center">
                        <span className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-6 border-b border-neutral-100 dark:border-neutral-800 pb-1">この意味を持つ単語は？</span>
                        <h3 className="text-3xl sm:text-4xl font-bold mb-12 text-center" style={{ fontFamily: 'var(--font-noto-serif-jp)' }}>{currentCard.meaning}</h3>

                        <div className="w-full max-w-md space-y-6">
                            <input
                                autoFocus
                                type="text"
                                value={writingInput}
                                onChange={(e) => setWritingInput(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && !isAnswerChecked && handleCheckAnswer(currentCard.id, currentCard.word)}
                                disabled={isAnswerChecked}
                                placeholder="単語を入力..."
                                className={`w-full p-4 text-2xl font-bold text-center bg-neutral-50 dark:bg-black border-2 rounded-2xl focus:outline-none transition-all ${isAnswerChecked
                                    ? isCorrect
                                        ? 'border-green-500 bg-green-50 dark:bg-green-950/20 text-green-600'
                                        : 'border-red-500 bg-red-50 dark:bg-red-950/20 text-red-600'
                                    : 'border-neutral-200 dark:border-neutral-800 focus:border-indigo-500'
                                    }`}
                            />

                            {isAnswerChecked && (
                                <div className="animate-in slide-in-from-top-2 duration-300 text-center space-y-4">
                                    {!isCorrect && (
                                        <div>
                                            <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-1">正解:</p>
                                            <p className="text-3xl font-black text-indigo-600 dark:text-indigo-400 font-serif">{currentCard.word}</p>
                                        </div>
                                    )}
                                    <div className="flex flex-col items-center gap-2">
                                        <p className={`text-lg font-bold ${isCorrect ? 'text-green-500' : 'text-red-500'}`}>
                                            {isCorrect ? '✨ 正解！' : '📌 おしい！'}
                                        </p>
                                        <button
                                            onClick={handleWritingNext}
                                            autoFocus
                                            className="mt-4 px-12 py-3 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-full font-bold shadow-lg hover:scale-105 active:scale-95 transition-all"
                                        >
                                            次へ進む
                                        </button>
                                    </div>
                                </div>
                            )}

                            {!isAnswerChecked && (
                                <button
                                    onClick={() => handleCheckAnswer(currentCard.id, currentCard.word)}
                                    disabled={!writingInput.trim()}
                                    className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold text-lg shadow-lg shadow-indigo-500/30 hover:bg-indigo-700 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    回答をチェック
                                </button>
                            )}
                        </div>
                    </div>
                </main>
            </div>
        );
    }
    return (
        <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 p-6 sm:p-12 font-sans transition-colors duration-300 pb-24">
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
                        <div className="flex flex-col gap-4">
                            <div className="flex items-center gap-2 bg-neutral-100 dark:bg-neutral-800 p-1 rounded-xl w-fit self-center sm:self-start mb-2">
                                <button
                                    onClick={() => setIsRandomMode(false)}
                                    className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${!isRandomMode ? 'bg-white dark:bg-neutral-700 shadow-sm text-neutral-900 dark:text-white' : 'text-neutral-500 hover:text-neutral-700'}`}
                                >
                                    🔢 順序通り
                                </button>
                                <button
                                    onClick={() => {
                                        if (deck) setShuffledWords(shuffleArray(deck.words));
                                        setIsRandomMode(true);
                                    }}
                                    className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${isRandomMode ? 'bg-indigo-600 shadow-md text-white' : 'text-neutral-500 hover:text-neutral-700'}`}
                                >
                                    🔀 ランダム
                                </button>
                            </div>
                            <div className="flex flex-wrap gap-4 justify-center sm:justify-start">
                                <button onClick={() => { handleRestart(); setMode('flashcard'); }} className="px-8 py-4 bg-indigo-600 text-white text-lg font-bold rounded-full shadow-lg hover:bg-indigo-700 hover:shadow-indigo-500/30 hover:-translate-y-1 transition-all active:scale-95 flex items-center gap-3">
                                    <span className="text-2xl">🎴</span> フラッシュカード
                                </button>
                                <button onClick={() => { handleRestart(); setMode('writing_test'); }} className="px-8 py-4 bg-white dark:bg-neutral-800 border-2 border-indigo-100 dark:border-neutral-800 text-indigo-600 dark:text-indigo-400 text-lg font-bold rounded-full shadow-md hover:border-indigo-500 transition-all active:scale-95 flex items-center gap-3">
                                    <span className="text-2xl">📝</span> Writingテスト
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Word List */}
                <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/50 flex flex-col sm:flex-row items-center justify-between gap-4">
                        <div className="flex items-center gap-4 flex-1">
                            {!isSelectionMode ? (
                                <button
                                    onClick={() => setIsSelectionMode(true)}
                                    className="px-4 py-2 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-sm font-bold text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition"
                                >
                                    選択する
                                </button>
                            ) : (
                                <div className="flex items-center gap-4 animate-in fade-in slide-in-from-left-2">
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="checkbox"
                                            checked={sortedWords.length > 0 && sortedWords.every(w => w.id && selectedWordIds.has(w.id))}
                                            onChange={handleSelectAll}
                                            className="w-5 h-5 rounded border-neutral-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                        />
                                        <span className="text-sm font-bold text-neutral-600 dark:text-neutral-400">
                                            {selectedWordIds.size} 選択中
                                        </span>
                                    </div>

                                    {selectedWordIds.size > 0 && (
                                        <div className="flex items-center gap-2">
                                            <button onClick={handleBulkDelete} className="px-3 py-1.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800 rounded-lg text-xs font-bold shadow-sm hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors flex items-center gap-1">
                                                <span>️</span> 一括削除
                                            </button>
                                        </div>
                                    )}

                                    <button
                                        onClick={() => {
                                            setIsSelectionMode(false);
                                            setSelectedWordIds(new Set());
                                        }}
                                        className="px-3 py-1.5 bg-neutral-200 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 rounded-lg text-xs font-bold hover:bg-neutral-300 dark:hover:bg-neutral-700 transition ml-2"
                                    >
                                        キャンセル
                                    </button>
                                </div>
                            )}
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
                                className="group p-6 border-b border-neutral-100 dark:border-neutral-800 last:border-0 hover:bg-neutral-50 dark:hover:bg-neutral-800/30 transition-colors flex gap-4 items-start relative select-none"
                            >
                                {isSelectionMode && (
                                    <div className="pt-1.5">
                                        <input
                                            type="checkbox"
                                            checked={card.id ? selectedWordIds.has(card.id) : false}
                                            onChange={() => card.id && toggleSelectWord(card.id)}
                                            className="w-5 h-5 rounded border-neutral-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                        />
                                    </div>
                                )}

                                {/* Editing Form */}
                                {editingWordId === card.id ? (
                                    <div className="flex-1 space-y-4">
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-xs font-bold text-neutral-400 uppercase mb-1">単語</label>
                                                <input
                                                    value={editFormData.word}
                                                    onChange={(e) => setEditFormData({ ...editFormData, word: e.target.value })}
                                                    className="w-full p-2 border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-black font-serif font-bold"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-neutral-400 uppercase mb-1">品詞</label>
                                                <select
                                                    value={editFormData.partOfSpeech}
                                                    onChange={(e) => setEditFormData({ ...editFormData, partOfSpeech: e.target.value })}
                                                    className="w-full p-2 border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-black"
                                                >
                                                    <option value="">(未設定)</option>
                                                    <option value="noun">名詞 (noun)</option>
                                                    <option value="verb">動詞 (verb)</option>
                                                    <option value="adjective">形容詞 (adjective)</option>
                                                    <option value="adverb">副詞 (adverb)</option>
                                                    <option value="preposition">前置詞 (preposition)</option>
                                                    <option value="conjunction">接続詞 (conjunction)</option>
                                                    <option value="pronoun">代名詞 (pronoun)</option>
                                                    <option value="interjection">間投詞 (interjection)</option>
                                                    <option value="idiom">熟語 (idiom)</option>
                                                </select>
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-neutral-400 uppercase mb-1">意味</label>
                                            <textarea
                                                value={editFormData.meaning}
                                                onChange={(e) => setEditFormData({ ...editFormData, meaning: e.target.value })}
                                                rows={3}
                                                className="w-full p-2 border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-black font-bold text-sm"
                                            ></textarea>
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-xs font-bold text-neutral-400 uppercase mb-1">例文 (EN)</label>
                                                <textarea
                                                    value={editFormData.example}
                                                    onChange={(e) => setEditFormData({ ...editFormData, example: e.target.value })}
                                                    rows={2}
                                                    className="w-full p-2 border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-black text-sm"
                                                ></textarea>
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-neutral-400 uppercase mb-1">例文 (JP)</label>
                                                <textarea
                                                    value={editFormData.example_jp}
                                                    onChange={(e) => setEditFormData({ ...editFormData, example_jp: e.target.value })}
                                                    rows={2}
                                                    className="w-full p-2 border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-black text-sm"
                                                />
                                            </div>
                                        </div>
                                        <div className="flex justify-end gap-2 mt-2">
                                            <button onClick={handleCancelEdit} className="px-4 py-2 bg-neutral-200 dark:bg-neutral-800 rounded font-bold text-sm">キャンセル</button>
                                            <button onClick={handleSaveEdit} className="px-4 py-2 bg-indigo-600 text-white rounded font-bold text-sm">保存</button>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        <div className="flex-1 flex flex-col sm:flex-row gap-4 sm:items-baseline pr-12">
                                            <div className="flex flex-wrap items-baseline gap-2 sm:gap-3 min-w-[120px] sm:min-w-[200px]">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-lg font-bold font-serif break-all" style={{ fontFamily: 'var(--font-merriweather)' }}>{card.word}</span>

                                                </div>
                                            </div>
                                            <div className="flex-1">
                                                <div className="font-medium text-neutral-800 dark:text-neutral-200 mb-2 whitespace-pre-wrap" style={{ fontFamily: 'var(--font-noto-serif-jp)' }}>{card.meaning}</div>
                                                <div className="space-y-1">
                                                    {/* 例文セクション (ロック機能なし) */}
                                                    {card.example ? (
                                                        <div className="space-y-3">
                                                            <button
                                                                onClick={() => card.id && toggleExampleVisibility(card.id)}
                                                                className="flex items-center gap-1 text-xs font-bold text-indigo-500 hover:text-indigo-600 transition-colors mb-2"
                                                            >
                                                                <span className="text-[10px]">{expandedListItems[card.id!] ? '▼' : '▶'}</span>
                                                                {expandedListItems[card.id!] ? '例文を隠す' : '例文を表示'}
                                                            </button>

                                                            {expandedListItems[card.id!] && (
                                                                <div className="animate-in fade-in slide-in-from-top-1 duration-200">
                                                                    {/* メイン例文 (Legacy) - 新しい例文がある場合は常に非表示にする（重複防止） */}
                                                                    {(!card.otherExamples || card.otherExamples.length === 0) && card.example && (
                                                                        <div className="mb-3">
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
                                                                    )}

                                                                    {/* 追加の例文表示 (リスト表示) */}
                                                                    {card.otherExamples && card.otherExamples.length > 0 && (
                                                                        <div className="pl-2 border-l-2 border-indigo-100 dark:border-neutral-800 space-y-3">
                                                                            {card.otherExamples.filter((ex: any) => ex && typeof ex.text === 'string' && ex.text.trim() !== "").map((ex: any, i) => (
                                                                                <div key={i} className="text-sm">
                                                                                    {ex.role && (
                                                                                        <div className="mb-1">
                                                                                            <span className="text-xs font-bold text-neutral-600 dark:text-neutral-300">{ex.role}</span>
                                                                                        </div>
                                                                                    )}
                                                                                    <div className="flex items-start gap-2 mb-1">
                                                                                        {ex.text && (
                                                                                            <button onClick={() => speak(ex.text)} className="mt-0.5 text-neutral-400 hover:text-indigo-500 transition-colors shrink-0">
                                                                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
                                                                                            </button>
                                                                                        )}
                                                                                        <div className="text-neutral-800 dark:text-neutral-200 font-serif">"{ex.text}"</div>
                                                                                    </div>
                                                                                    <div className="text-xs text-neutral-500 font-light pl-6">{ex.translation}</div>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <button
                                                            onClick={() => card.id && handleGenerateDetails(card.id)}
                                                            className="mt-2 text-xs font-bold text-amber-500 hover:text-amber-600 flex items-center gap-1 px-3 py-1.5 bg-amber-50 dark:bg-amber-900/10 rounded-full w-fit"
                                                        >
                                                            <span>🪄</span> 例文を生成
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Action Buttons */}
                                        <div className="absolute top-4 right-4 flex gap-2 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                                            {/* Edit Button */}
                                            <button
                                                onClick={() => handleStartEdit(card)}
                                                className="text-neutral-300 hover:text-indigo-500 bg-white/80 dark:bg-black/80 sm:bg-transparent rounded-full p-2"
                                                title="Edit word"
                                            >
                                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                                            </button>
                                            {/* Delete Button */}
                                            <button
                                                onClick={() => handleDeleteWord(card.id)}
                                                className="text-neutral-300 hover:text-red-500 bg-white/80 dark:bg-black/80 sm:bg-transparent rounded-full p-2"
                                                title="Remove word"
                                            >
                                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg>
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                        ))
                    )}
                </div>
            </main >
        </div >
    );
}
