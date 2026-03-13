"use client";

import { useState, useEffect, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import confetti from "canvas-confetti";
import { motion, useMotionValue, useTransform, useAnimation } from "framer-motion";
import { useDrag } from "@use-gesture/react";

type WordCard = {
    id?: string;
    word: string;
    partOfSpeech?: string;
    meaning: string;
    example: string;
    example_jp: string;
    otherExamples?: { role: string; text: string; translation: string }[];
    isMastered?: boolean;

    createdAt?: string;
    synonyms?: { word: string; partOfSpeech: string; meaning: string }[];
    derivatives?: { word: string; partOfSpeech: string; meaning: string }[];
};

type Deck = {
    id: string;
    title: string;
    study_count?: number;
    last_studied_at?: string | null;
    words: WordCard[];
};

type Folder = {
    id: string;
    name: string;
    createdAt: string;
    decks?: Deck[];
};

// Helper function to process raw word data from API (handles custom markers in example_jp)
const processWordCard = (w: any): WordCard => {
    if (!w || typeof w !== 'object') return w;

    // Force string conversion for safety
    let cleanExampleJp = String(w.example_jp || "");
    let otherExamples: any[] = Array.isArray(w.otherExamples) ? w.otherExamples : [];

    // 1. アンロックマーカーのチェック (表示上は除去)
    if (cleanExampleJp.includes('|||UNLOCKED|||')) {
        cleanExampleJp = cleanExampleJp.replace('|||UNLOCKED|||', '');
    }

    // 2. 追加例文マーカーのチェック
    if (cleanExampleJp.includes('|||EXT|||')) {
        const parts = cleanExampleJp.split('|||EXT|||');
        cleanExampleJp = parts[0] || "";
        try {
            const extPart = parts[1].split('|||UNLOCKED|||')[0]; // |||UNLOCKED||| が後ろにある可能性を考慮
            const parsed = JSON.parse(extPart);
            if (Array.isArray(parsed)) {
                otherExamples = parsed;
            } else if (parsed && typeof parsed === 'object') {
                if (parsed.examples && Array.isArray(parsed.examples)) {
                    otherExamples = parsed.examples;
                }
            }
        } catch (e) {
            console.warn("Failed to parse extended data", e);
        }
    }

    // Clean otherExamples to match expected structure
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
        synonyms: Array.isArray(w.synonyms) ? w.synonyms : undefined,
        derivatives: Array.isArray(w.derivatives) ? w.derivatives : undefined,
    };
};

const formatMeaningText = (text: string) => {
    if (!text) return text;
    return text.replace(/\s*(\(|【|\[)(名|動|形|副|代|接|前|間|冠|群|他|自|熟|自動|他動|可算|不可算|単数|複数|名詞|動詞|形容詞|副詞|代名詞|接続詞|前置詞|間投詞|冠詞)(\)|】|\])/g, '\n$1$2$3').trim();
};

export type TargetMatch = {
    matchedString: string;
    suffixToKeep: string;
    corePhrase: string;
};

// Helper: Extract core phrase by removing placeholders like 'be', 'do', '~', 'someone'
const extractCorePhrase = (phrase: string): string => {
    let core = phrase.toLowerCase();
    const placeholders = [
        /\b(?:be|do|have|get|someone|somebody|something|one's|one|a|an|the)\b/gi,
        /[~〜]/g, // Tildes
        /[().,!?]/g // Punctuation
    ];

    placeholders.forEach(regex => {
        core = core.replace(regex, ' ');
    });

    // Clean up multiple spaces
    return core.replace(/\s+/g, ' ').trim();
};

const findTargetMatchInSentence = (basePhrase: string, sentence: string): TargetMatch | null => {
    if (!basePhrase || !sentence) return null;

    const corePhrase = basePhrase.split(/\s+/).length > 1 ? extractCorePhrase(basePhrase) : basePhrase.toLowerCase().trim();
    if (!corePhrase) return null; // Fallback if phrase was entirely placeholders

    // For single words or short phrases, we still check word-by-word or by core phrase substring
    const lowerCore = corePhrase.toLowerCase();

    // 1. Phrasal exactly matches inside the sentence
    if (basePhrase.split(/\s+/).length > 1) {
        if (sentence.toLowerCase().includes(lowerCore)) {
            // Find the actual matched casing in the sentence
            const idx = sentence.toLowerCase().indexOf(lowerCore);
            return {
                matchedString: sentence.substring(idx, idx + lowerCore.length),
                suffixToKeep: "",
                corePhrase: corePhrase
            };
        }
        // If it's a phrase and the core isn't found, it's too complex or conjugated to easily blank out.
        return null;
    }

    // 2. Single word processing (conjugations and suffixes)
    const lowerBase = corePhrase;

    // Map of common irregular verbs that should be disqualified from Fill-In logic
    const irregularVerbs: Record<string, string[]> = {
        'take': ['took', 'taken', 'taking'], 'go': ['went', 'gone', 'going'],
        'see': ['saw', 'seen', 'seeing'], 'eat': ['ate', 'eaten', 'eating'],
        'come': ['came', 'coming'], 'get': ['got', 'gotten', 'getting'],
        'give': ['gave', 'given', 'giving'], 'know': ['knew', 'known', 'knowing'],
        'make': ['made', 'making'], 'say': ['said', 'saying'],
        'think': ['thought', 'thinking'], 'write': ['wrote', 'written', 'writing'],
        'speak': ['spoke', 'spoken', 'speaking'], 'break': ['broke', 'broken', 'breaking'],
        'choose': ['chose', 'chosen', 'choosing'], 'drive': ['drove', 'driven', 'driving'],
        'fall': ['fell', 'fallen', 'falling'], 'fly': ['flew', 'flown', 'flying'],
        'forget': ['forgot', 'forgotten', 'forgetting'], 'begin': ['began', 'begun', 'beginning'],
        'drink': ['drank', 'drunk', 'drinking'], 'ring': ['rang', 'rung', 'ringing'],
        'run': ['ran', 'running'], 'sing': ['sang', 'sung', 'singing'],
        'swim': ['swam', 'swum', 'swimming'], 'buy': ['bought', 'buying'],
        'catch': ['caught', 'catching'], 'fight': ['fought', 'fighting'],
        'teach': ['taught', 'teaching'], 'build': ['built', 'building'],
        'lend': ['lent', 'lending'], 'send': ['sent', 'sending'],
        'spend': ['spent', 'spending'], 'leave': ['left', 'leaving'],
        'feel': ['felt', 'feeling'], 'keep': ['kept', 'keeping'],
        'sleep': ['slept', 'sleeping'], 'meet': ['met', 'meeting'],
        'lead': ['led', 'leading'], 'read': ['reading'], // Note: 'reads' or 'read' are ok. 'reading' is ok as suffix 'ing'. We put it here if we want to disqualify irregular base matching but actually 'read' doesn't change spelling except suffix. 
        'hear': ['heard', 'hearing'], 'pay': ['paid', 'paying'],
        'find': ['found', 'finding'], 'have': ['had', 'having', 'has'],
        'do': ['did', 'done'], 'be': ['am', 'is', 'are', 'was', 'were', 'been']
    };

    // Helper to strip punctuation from a word
    const stripPunctuation = (word: string) => word.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '');
    const tokens = sentence.split(/\s+/);

    for (const token of tokens) {
        const w = stripPunctuation(token);
        if (!w) continue;
        const lw = w.toLowerCase();

        // Check if the word is an irregular form - if so, disqualify it by returning null early
        if (irregularVerbs[lowerBase] && irregularVerbs[lowerBase].includes(lw)) {
            return null; // Skip this example entirely
        }

        // Exact match
        if (lw === lowerBase) {
            return { matchedString: w, suffixToKeep: "", corePhrase: lowerBase };
        }

        // Check standard suffixes that we want to keep visible
        const stems = [
            { stem: lowerBase, form: 'regular' },
            { stem: lowerBase.endsWith('e') ? lowerBase.slice(0, -1) : lowerBase, form: 'drop-e' },
            { stem: lowerBase.endsWith('y') ? lowerBase.slice(0, -1) + 'i' : lowerBase, form: 'y-to-i' },
            { stem: lowerBase + lowerBase.slice(-1), form: 'double' }
        ];

        for (const { stem, form } of stems) {
            if (stem.length > 2) {
                // Determine the visible suffix (what is rendered outside the brackets) and the matched substring
                if (lw === stem + 's') return { matchedString: w, suffixToKeep: form === 'y-to-i' ? 'es' : 's', corePhrase: lowerBase };
                if (lw === stem + 'es') return { matchedString: w, suffixToKeep: form === 'y-to-i' ? 'ies' : 'es', corePhrase: lowerBase };
                if (lw === stem + 'ed') return { matchedString: w, suffixToKeep: form === 'y-to-i' ? 'ied' : 'ed', corePhrase: lowerBase };
                if (lw === stem + 'd') return { matchedString: w, suffixToKeep: 'd', corePhrase: lowerBase };
                if (lw === stem + 'ing') return { matchedString: w, suffixToKeep: form === 'double' ? w.slice(-4) : 'ing', corePhrase: lowerBase };
            }
        }
    }

    return null;
};

export default function DeckPage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const params = useParams();
    const searchParams = useSearchParams();
    const deckId = params.id as string;
    const from = searchParams.get('from');

    const [deck, setDeck] = useState<Deck | null>(null);
    const [loading, setLoading] = useState(true);
    const [isBulkGenerating, setIsBulkGenerating] = useState(false);

    // モード管理: 'list' (一覧) | 'flashcard' (学習) | 'writing_test' (テスト) | 'dictation' (書き取り)
    const [mode, setMode] = useState<'list' | 'flashcard' | 'writing_test' | 'dictation'>('list');

    // Challenge Type: 'word' (単語のみ) | 'fill-in' (穴埋め) | 'full' (全文)
    const [challengeType, setChallengeType] = useState<'word' | 'fill-in' | 'full'>('word');
    // For Mode Selection Modal
    const [selectingModeFor, setSelectingModeFor] = useState<'writing_test' | 'dictation' | null>(null);

    // Writing Test State
    const [writingInput, setWritingInput] = useState("");
    const [isAnswerChecked, setIsAnswerChecked] = useState(false);
    const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
    const [showHint, setShowHint] = useState(false);

    // Flashcard state
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isFlipped, setIsFlipped] = useState(false);
    const [isFinished, setIsFinished] = useState(false);
    const [showExamples, setShowExamples] = useState(false); // フラッシュカード用例文表示
    const [isRandomMode, setIsRandomMode] = useState(false);
    const [shuffledWords, setShuffledWords] = useState<WordCard[]>([]);
    const [wrongWordIds, setWrongWordIds] = useState<Set<string>>(new Set());
    const [reviewWords, setReviewWords] = useState<WordCard[] | null>(null); // null means normal mode
    const [includeMastered, setIncludeMastered] = useState(false);
    const [earnedXp, setEarnedXp] = useState(0);

    const lastStudiedText = useMemo(() => {
        if (!deck?.last_studied_at) return "未学習";
        const lastDate = new Date(deck.last_studied_at);
        const now = new Date();
        const lastDateDay = new Date(lastDate.getFullYear(), lastDate.getMonth(), lastDate.getDate());
        const nowDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const diffTime = nowDay.getTime() - lastDateDay.getTime();
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays === 0) return "今日";
        if (diffDays === 1) return "昨日";
        return `${diffDays}日前`;
    }, [deck?.last_studied_at]);

    // Swipe animation state
    const cardX = useMotionValue(0);
    const cardY = useMotionValue(0);
    const cardRotate = useTransform(cardX, [-200, 200], [-15, 15]);
    const cardOpacity = useTransform(cardX, [-200, -100, 0, 100, 200], [0.5, 1, 1, 1, 0.5]);
    const rightOverlayOpacity = useTransform(cardX, [0, 100], [0, 1]);
    const leftOverlayOpacity = useTransform(cardX, [0, -100], [0, 1]);
    const swipeControls = useAnimation();

    const bindCardDrag = useDrag(({ down, movement: [mx, my], velocity: [vx, vy], direction: [dx, dy] }) => {
        if (mode !== 'flashcard' || showExamples) return;

        if (down) {
            cardX.set(mx);
            cardY.set(my);
        } else {
            const currentX = cardX.get();
            if (currentX > 100 || (vx > 0.5 && dx > 0)) {
                // Swipe Right -> Known
                swipeControls.start({ x: 500, opacity: 0, transition: { duration: 0.2 } }).then(() => {
                    handleSwipeComplete('right');
                });
            } else if (currentX < -100 || (vx > 0.5 && dx < 0)) {
                // Swipe Left -> Review
                swipeControls.start({ x: -500, opacity: 0, transition: { duration: 0.2 } }).then(() => {
                    handleSwipeComplete('left');
                });
            } else {
                // Snap back
                swipeControls.start({ x: 0, y: 0, transition: { type: 'spring', stiffness: 300, damping: 20 } });
            }
        }
    });

    const handleSwipeComplete = (direction: 'left' | 'right') => {
        const words = reviewWords || (isRandomMode ? shuffledWords : sortedWords);
        const currentCard = words[currentIndex];

        if (direction === 'left' && currentCard?.id) {
            setWrongWordIds(prev => new Set(prev).add(currentCard.id as string));
        }

        setIsFlipped(false);
        setShowExamples(false);
        cardX.set(0);
        cardY.set(0);
        swipeControls.set({ opacity: 1 });

        if (currentIndex < words.length - 1) {
            setCurrentIndex((prev) => prev + 1);
        } else {
            finishSession(flippedIndices.size * 5);
        }
    };

    // Sort & Filter
    const [sortKey, setSortKey] = useState<'created_desc' | 'created_asc' | 'pos'>('created_asc');

    // ソートロジック
    const getSortedWords = () => {
        if (!deck || !Array.isArray(deck.words)) return [];
        // Filter nulls again just in case, and attach original index for stable sorting fallback
        const wordsWithIndex = deck.words
            .map((w, index) => ({ w, index }))
            .filter(item => item.w && typeof item.w === 'object');

        switch (sortKey) {
            case 'created_asc':
                wordsWithIndex.sort((a, b) => {
                    const cmp = String(a.w.createdAt || '').localeCompare(String(b.w.createdAt || ''));
                    return cmp !== 0 ? cmp : a.index - b.index;
                });
                break;
            case 'created_desc':
                wordsWithIndex.sort((a, b) => {
                    const cmp = String(b.w.createdAt || '').localeCompare(String(a.w.createdAt || ''));
                    return cmp !== 0 ? cmp : b.index - a.index;
                });
                break;
            case 'pos':
                wordsWithIndex.sort((a, b) => {
                    const cmp = String(a.w.partOfSpeech || '').localeCompare(String(b.w.partOfSpeech || ''));
                    return cmp !== 0 ? cmp : a.index - b.index;
                });
                break;
        }
        return wordsWithIndex.map(item => item.w);
    };

    const sortedWords = getSortedWords();

    // Helper to get words for the current session (Review/Writing/Dictation)
    const getSessionWords = () => {
        if (reviewWords) return reviewWords;
        const source = isRandomMode ? shuffledWords : sortedWords;
        const active = includeMastered ? source : source.filter(w => !w.isMastered);
        return active.length > 0 ? active : source;
    };

    // Active Example Memo for Writing/Fill-in Test
    // Using useMemo instead of useEffect to avoid flash of previous content on card switch
    const activeExample = useMemo(() => {
        const words = getSessionWords();
        const card = words[currentIndex];
        if (!card) return null;

        const allExamples = [
            { text: card.example, translation: card.example_jp },
            ...(card.otherExamples || [])
        ].filter(ex => ex && ex.text && ex.translation && ex.text.trim() !== "" && ex.translation.trim() !== "");

        if (allExamples.length === 0) {
            return null;
        }

        // Map examples to include their TargetMatch object
        const mappedExamples = allExamples.map(ex => {
            const match = challengeType === 'word'
                ? { matchedString: card.word, suffixToKeep: "", corePhrase: card.word }
                : findTargetMatchInSentence(card.word, ex.text);

            return {
                ...ex,
                targetMatch: match
            };
        });

        // Valid candidates: For fill-in mode, we STRICTLY require a targetMatch.
        // For other modes (word, full), any example is fine.
        const candidates = mappedExamples.filter(ex =>
            challengeType !== 'fill-in' || ex.targetMatch !== null
        );

        if (candidates.length > 0) {
            return candidates[Math.floor(Math.random() * candidates.length)];
        }

        // If there are no valid examples (e.g. all use irregular conjugations for fill-in),
        // we return null. The UI will gracefully degrade to a standard "Word" challenge.
        return null;
    }, [currentIndex, isRandomMode, reviewWords, deck?.id, challengeType, includeMastered, shuffledWords, includeMastered]);

    // Dictation Mode Auto-Speak
    useEffect(() => {
        if (mode === 'dictation' && !isFinished) {
            const words = getSessionWords();
            const currentCard = words[currentIndex];
            if (currentCard) {
                // Determine text to speak based on challenge type
                let textToSpeak = currentCard.word;
                if (challengeType !== 'word') {
                    // Use activeExample if available (same as text displayed in answer)
                    textToSpeak = activeExample?.text || currentCard.example;
                }

                // Delay slightly to ensure UI is ready and feels natural
                const timer = setTimeout(() => speak(textToSpeak), 600);
                return () => clearTimeout(timer);
            }
        }
    }, [mode, currentIndex, isFinished, challengeType, activeExample]);

    // List Item Detail State
    const [expandedListItems, setExpandedListItems] = useState<Record<string, boolean>>({});

    // XP Tracking States
    const [flippedIndices, setFlippedIndices] = useState<Set<number>>(new Set());
    const [sessionCorrectCount, setSessionCorrectCount] = useState(0);

    // ActiveExample moved up

    // Copy/Move Feature State
    const [showMoveModal, setShowMoveModal] = useState(false);
    const [targetDeckId, setTargetDeckId] = useState<string>("");
    const [moveAction, setMoveAction] = useState<'copy' | 'move'>('copy');
    const [myDecks, setMyDecks] = useState<{ id: string, title: string }[]>([]);
    const [credits, setCredits] = useState(0);
    const [plan, setPlan] = useState<string | null>(null);

    useEffect(() => {
        if (session?.user) {
            fetch("/api/user/credits")
                .then(async r => {
                    if (!r.ok) {
                        const text = await r.text();
                        throw new Error(`HTTP error! status: ${r.status}, body: ${text}`);
                    }
                    return r.json();
                })
                .then(d => {
                    setCredits(d.credits || 0);
                })
                .catch(e => {
                    console.error("Failed to fetch credits:", e);
                    setCredits(0);
                });
        }
    }, [session]);

    useEffect(() => {
        if (showMoveModal) {
            // Fetch user's decks for the move modal
            fetch("/api/decks").then(res => res.json()).then(data => {
                if (Array.isArray(data)) {
                    setMyDecks(data.filter((d: any) => d.id !== deckId)); // Exclude current deck
                }
            }).catch(console.error);
        }
    }, [showMoveModal, deckId]);

    const handleMoveWords = async (action: 'copy' | 'move') => {
        if (!targetDeckId) return;

        const selectedWordsData = deck?.words.filter(w => w.id && selectedWordIds.has(w.id));
        if (!selectedWordsData || selectedWordsData.length === 0) return;

        // Duplicate Check
        const targetDeck = (myDecks as any[]).find(d => d.id === targetDeckId);
        let wordsToTransfer = [...selectedWordsData];
        let skippedWords: string[] = [];

        if (targetDeck && Array.isArray(targetDeck.words)) {
            const existingWords = new Set(targetDeck.words.map((w: any) => w.word.toLowerCase().trim()));
            wordsToTransfer = selectedWordsData.filter(w => {
                const isDuplicate = existingWords.has(w.word.toLowerCase().trim());
                if (isDuplicate) {
                    skippedWords.push(w.word);
                }
                return !isDuplicate;
            });
        }

        const count = wordsToTransfer.length;

        // If all duplicates
        if (count === 0) {
            alert(`選択した単語は、移動先の "${targetDeck?.title}" にすべて登録済みです。`);
            return;
        }

        // Confirmation Message
        let message = "";
        let skippedMsg = "";
        if (skippedWords.length > 0) {
            const details = skippedWords.length > 5
                ? `${skippedWords.slice(0, 5).join(", ")}... 他${skippedWords.length - 5}語`
                : skippedWords.join(", ");
            skippedMsg = `\n\n⚠️ ${skippedWords.length} 語は重複しているため${action === 'move' ? '移動' : 'コピー'}されません：\n(${details})`;
        }

        if (action === 'copy') {
            if (credits < count) {
                alert(`コインが足りません。\n必要: ${count}枚\n所持: ${credits}枚`);
                return;
            }
            message = `${count}単語をコピーしますか？\nコインを${count}枚消費します。${skippedMsg}`;
        } else {
            message = `${count}単語を移動しますか？${skippedMsg}`;
        }

        if (!confirm(message)) return;

        setLoading(true);

        try {
            // Check cost for copy first
            if (action === 'copy') {
                const creditRes = await fetch("/api/user/credits/consume", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ amount: count })
                });
                if (!creditRes.ok) {
                    throw new Error("コインの消費に失敗しました");
                }
                const creditData = await creditRes.json();
                setCredits(creditData.credits);
            }

            // 1. Add to target deck
            const payload = wordsToTransfer.map(w => ({
                word: w.word,
                meaning: w.meaning,
                example: w.example,
                example_jp: w.example_jp,
                otherExamples: w.otherExamples,
                synonyms: w.synonyms, // Include synonyms
                derivatives: w.derivatives, // Include derivatives
                partOfSpeech: w.partOfSpeech
            }));

            const res = await fetch(`/api/decks/${targetDeckId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ words: payload }),
            });

            if (!res.ok) throw new Error("Failed to add words to target deck");

            // 2. If 'move', remove ONLY the transferred words from current deck
            if (action === 'move') {
                const transferredids = new Set(wordsToTransfer.map(w => w.id));
                await Promise.all(
                    wordsToTransfer.map(w =>
                        w.id ? fetch(`/api/words/${w.id}`, { method: "DELETE" }) : Promise.resolve()
                    )
                );

                // Update local state
                setDeck(prev => prev ? ({
                    ...prev,
                    words: prev.words.filter(w => w.id && !transferredids.has(w.id))
                }) : null);
            }

            // Fetch target deck to update local myDecks cache (so future moves know about new words immediately)
            fetch("/api/decks").then(res => res.json()).then(data => {
                if (Array.isArray(data)) {
                    setMyDecks(data.filter((d: any) => d.id !== deckId));
                }
            }).catch(console.error);

            const resultMsg = action === 'copy'
                ? `単語をコピーしました！(コイン -${count})${skippedWords.length > 0 ? `\n(重複 ${skippedWords.length} 語はスキップされました)` : ''}`
                : `単語を移動しました！${skippedWords.length > 0 ? `\n(重複 ${skippedWords.length} 語はスキップされました)` : ''}`;

            alert(resultMsg);

            setShowMoveModal(false);
            setTargetDeckId("");
            setIsSelectionMode(false);
            setSelectedWordIds(new Set());

        } catch (e: any) {
            console.error(e);
            alert(`エラーが発生しました: ${e.message}`);
        } finally {
            setLoading(false);
        }
    };

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


    const toggleMastered = async (id: string, currentStatus: boolean, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();

        // Optimistic update
        setDeck(prev => {
            if (!prev) return null;
            return {
                ...prev,
                words: prev.words.map(w => w.id === id ? { ...w, isMastered: !currentStatus } : w)
            };
        });

        try {
            await fetch(`/api/words/${id}/master`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ isMastered: !currentStatus })
            });
        } catch (err) {
            console.error("Failed to update mastered status", err);
            // Revert on error (optional, but good practice)
        }
    };

    // Title edit state
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [editTitle, setEditTitle] = useState("");

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

    const fetchDailyQuiz = async () => {
        try {
            const res = await fetch("/api/user/daily-quiz");
            if (res.ok) {
                const data = await res.json();
                const processedWords = data.words.map((w: any) => processWordCard(w));
                setDeck({
                    id: "daily-10",
                    title: "本日の10問",
                    words: processedWords,
                    study_count: data.study_count,
                    last_studied_at: data.last_studied_at
                });
            } else {
                alert("クイズの作成に失敗しました");
                router.push("/");
            }
        } catch (e) {
            console.error(e);
            alert("クイズ作成エラー");
        } finally {
            setLoading(false);
        }
    };

    const fetchDeck = async () => {
        if (deckId === 'daily-10') {
            return fetchDailyQuiz();
        }
        try {
            const res = await fetch(`/api/decks/${deckId}`);
            if (res.ok) {
                const data = await res.json();

                // 埋め込まれた追加例文とアンロック情報のパース処理
                const rawWords = Array.isArray(data.words) ? data.words : [];
                const processedWords = rawWords
                    .filter((w: any) => w && typeof w === 'object')
                    .map((w: any) => processWordCard(w));

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

    const handleGenerateDetails = async (wordId: string, isRegenerate: boolean = false) => {
        if (isRegenerate) {
            if (!confirm("例文を再生成しますか？\nコインを1枚消費します。")) return;
        }

        try {
            const res = await fetch(`/api/words/${wordId}/generate-details`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ force: isRegenerate })
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "Failed to generate");
            }

            // 成功したら全データを再取得
            await fetchDeck();
            if (isRegenerate) {
                alert("例文を再生成しました！ (コイン -1)");
            }

        } catch (e: any) {
            alert(e.message);
        }
    };

    const handleGenerateExtras = async (wordId: string, type: 'all' | 'synonyms', force: boolean = false) => {
        const cost = 1;
        const actionLabel = type === 'all' ? '類義語・派生語' : '類義語';
        const actionName = force ? `${actionLabel}の再生成` : `${actionLabel}の生成`;

        if (!confirm(`${actionName}を行いますか？\nコインを${cost}枚消費します。`)) return;

        try {
            const res = await fetch(`/api/words/${wordId}/generate-extras`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ type, force })
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "Failed to generate");
            }

            // Refresh deck
            await fetchDeck();
            alert(`${actionName}が完了しました！ (コイン -1)`);

        } catch (e: any) {
            alert(e.message);
        }
    };

    const handleBulkGenerate = async () => {
        if (!deck || isBulkGenerating) return;

        const wordsWithoutExamples = deck.words.filter(w => !w.example && (!w.otherExamples || w.otherExamples.length === 0));

        if (wordsWithoutExamples.length === 0) {
            alert("すべての単語に例文が生成されています。");
            return;
        }

        if (!confirm(`${wordsWithoutExamples.length}件の単語に対して例文をまとめて生成しますか？\n（時間がかかる場合があります）`)) return;

        setIsBulkGenerating(true);
        try {
            for (const word of wordsWithoutExamples) {
                if (!word.id) continue;
                await fetch(`/api/words/${word.id}/generate-details`, { method: "POST" });
            }
            await fetchDeck();
            alert("一括生成が完了しました！");
        } catch (e) {
            console.error(e);
            alert("一部の生成に失敗しました。");
        } finally {
            setIsBulkGenerating(false);
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

    const handleDeleteDeck = async () => {
        if (!deck) return;
        if (!confirm(`本当に単語帳「${deck.title}」を削除しますか？\nこの操作は取り消せません。`)) return;

        try {
            const res = await fetch(`/api/decks/${deckId}`, {
                method: "DELETE"
            });

            if (res.ok) {
                router.push("/");
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
    const [editFormData, setEditFormData] = useState<{
        word: string;
        meaning: string;
        partOfSpeech: string;
        example: string;
        example_jp: string;
        otherExamples: { role: string; text: string; translation: string }[];
        synonyms: { word: string; partOfSpeech: string; meaning: string }[];
        derivatives: { word: string; partOfSpeech: string; meaning: string }[];
    }>({
        word: "",
        meaning: "",
        partOfSpeech: "",
        example: "",
        example_jp: "",
        otherExamples: [],
        synonyms: [],
        derivatives: []
    });

    const handleStartEdit = (word: WordCard) => {
        setEditingWordId(word.id || null);
        setEditFormData({
            word: word.word,
            meaning: word.meaning,
            // partOfSpeech can be undefined in type, handle safely
            partOfSpeech: word.partOfSpeech || "",
            example: word.example,
            example_jp: word.example_jp,
            otherExamples: word.otherExamples?.map(ex => ({ ...ex })) || [],
            synonyms: word.synonyms?.map(s => ({ ...s })) || [],
            derivatives: word.derivatives?.map(d => ({ ...d })) || []
        });
    };

    const handleCancelEdit = () => {
        setEditingWordId(null);
        setEditFormData({ word: "", meaning: "", partOfSpeech: "", example: "", example_jp: "", otherExamples: [], synonyms: [], derivatives: [] });
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
                const processedUpdatedWord = processWordCard(updatedWord);
                setDeck({
                    ...deck,
                    words: deck.words.map(w => {
                        if (w.id === editingWordId) {
                            return {
                                ...w,
                                ...processedUpdatedWord
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

    const handleNext = () => {
        if (!deck) return;
        const words = reviewWords || (isRandomMode ? shuffledWords : sortedWords);
        setIsFlipped(false);
        setShowExamples(false);
        if (currentIndex < words.length - 1) {
            setTimeout(() => setCurrentIndex((prev) => prev + 1), 150);
        } else {
            finishSession(flippedIndices.size * 5);
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
        setIsAnswerChecked(false);
        setIsCorrect(null);
        setShowHint(false);
        setFlippedIndices(new Set());
        setSessionCorrectCount(0);
    };



    const handleRestart = (isReviewMistakes = false, newChallengeType?: 'word' | 'fill-in' | 'full') => {
        if (newChallengeType) setChallengeType(newChallengeType);
        setWrongWordIds(new Set());

        if (isReviewMistakes && deck) {
            const missed = (isRandomMode ? shuffledWords : sortedWords).filter(w => w.id && wrongWordIds.has(w.id));
            setReviewWords(missed);
        } else if (deck) {
            // Filter out mastered words for new session UNLESS includeMastered is true
            const activeWords = includeMastered ? sortedWords : sortedWords.filter(w => !w.isMastered);

            if (activeWords.length === 0 && sortedWords.length > 0) {
                // All words are mastered and includeMastered is false
                alert("全ての単語をマスター済みです！\n復習のために「マスター済みも含める」をオンにして開始します。");
                setIncludeMastered(true);
                setReviewWords(null); // Just run with full deck (since we set includedMastered to true, next render/effect or logic flow needs to handle it - actually here we need to force it for this run)
                // BUT state update is async, so for this run we need to use full list explicitly if we want immediate start.
                // Better pattern: just use shuffled/active words directly in getSessionWords, but handleRestart sets up state.
                // Simplest fix: Just allow it to happen, but since we are setting state, let's just use sortedWords for the shuffle if random.

                if (isRandomMode) {
                    setShuffledWords(shuffleArray(sortedWords));
                }
            } else {
                setReviewWords(null); // use standard flow
                // If random mode, we need to reshuffle only active words
                if (isRandomMode) {
                    setShuffledWords(shuffleArray(activeWords));
                }
            }
        }

        setIsFinished(false);
        setCurrentIndex(0);
        setIsFlipped(false);
        setShowExamples(false);
        setWritingInput("");
        setIsAnswerChecked(false);
        setIsCorrect(null);
        setShowHint(false);
        setFlippedIndices(new Set());
        setSessionCorrectCount(0);
    };

    const normalizeText = (text: string) => {
        return text
            .toLowerCase()
            .replace(/[.,!?;:"'’]/g, '') // Remove punctuation
            .replace(/\s+/g, ' ') // Collapse spaces
            .trim();
    };

    const handleCheckAnswer = (cardId: string | undefined, correctWord: string, correctExample?: string, targetCorePhrase?: string) => {
        const input = normalizeText(writingInput);
        let expected = "";

        if (challengeType === 'full' && correctExample) {
            expected = normalizeText(correctExample);
        } else if (challengeType === 'fill-in' && targetCorePhrase) {
            expected = normalizeText(targetCorePhrase);
        } else {
            expected = normalizeText(correctWord);
        }

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
            // Speak the answer (Word or Sentence)
            if (challengeType !== 'word' && correctExample) {
                speak(correctExample);
            } else {
                speak(correctWord);
            }
            setSessionCorrectCount(prev => prev + 1);
        }
    };

    const handleSkip = (cardId: string | undefined) => {
        setIsCorrect(false);
        setIsAnswerChecked(true);
        if (cardId) {
            setWrongWordIds(prev => new Set(prev).add(cardId));
        }
    };

    const handleWritingNext = () => {
        if (!deck) return;
        const words = reviewWords || (isRandomMode ? shuffledWords : sortedWords);

        if (currentIndex < words.length - 1) {
            setWritingInput("");
            setIsAnswerChecked(false);
            setIsCorrect(null);
            setShowHint(false);
            setTimeout(() => setCurrentIndex((prev) => prev + 1), 150);
        } else {
            finishSession(sessionCorrectCount * 5);
        }
    };

    const finishSession = async (earned: number) => {
        setIsFinished(true);
        setEarnedXp(earned);

        // Record study session
        try {
            if (!reviewWords) {
                const res = await fetch(`/api/decks/${deckId}/study`, {
                    method: "POST",
                });
                if (res.ok) {
                    const data = await res.json();
                    // Update local deck state with new stats
                    setDeck(prev => prev ? ({
                        ...prev,
                        study_count: data.study_count,
                        last_studied_at: data.last_studied_at
                    }) : null);
                }
            }
        } catch (e) {
            console.error("Failed to record study session", e);
        }

        if (earned > 0) {
            // Shoot confetti
            confetti({
                particleCount: 150,
                spread: 70,
                origin: { y: 0.6 }
            });

            // Save XP to server
            try {
                await fetch("/api/user/add-xp", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ amount: earned }),
                });
            } catch (e) {
                console.error("Failed to add XP", e);
            }
        }
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
            setShuffledWords(shuffleArray(sortedWords));
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
            // 日本語が含まれているか簡易判定 (ひらがな, カタカナ, 漢字)
            const isJapanese = /[一-龠]+|[ぁ-ん]+|[ァ-ヴー]+/.test(text);
            utterance.lang = isJapanese ? 'ja-JP' : 'en-US';
            utterance.rate = 1.0;
            window.speechSynthesis.speak(utterance);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#050505]">
                <div className="animate-spin h-8 w-8 border-4 border-indigo-500 rounded-full border-t-transparent"></div>
            </div>
        );
    }

    if (!deck) return null;

    // --- フラッシュカードモード ---
    if (mode === 'flashcard') {
        if (isFinished) {
            return (
                <div className="min-h-screen flex flex-col items-center justify-center bg-[#050505] p-6">
                    <div className="text-center space-y-6 animate-in zoom-in duration-300">
                        <div className="text-6xl mb-4">🎉</div>
                        <h1 className="text-3xl font-bold text-white">お疲れ様でした！</h1>
                        <p className="text-neutral-500">"{deck.title}" の学習が終了しました。</p>
                        {earnedXp > 0 && (
                            <div className="animate-bounce mt-4 inline-block px-6 py-2 bg-yellow-400 text-yellow-900 font-black rounded-full shadow-lg transform rotate-[-2deg]">
                                + {earnedXp} XP GET!
                            </div>
                        )}
                        <div className="flex flex-col sm:flex-row flex-wrap gap-4 justify-center items-center mt-8 w-full max-w-2xl mx-auto">
                            <button onClick={() => handleRestart(false)} className="px-8 py-3 bg-indigo-600 text-white rounded-full font-bold shadow-lg hover:bg-indigo-700 transition w-full sm:w-auto text-center">最初から学習する</button>
                            {wrongWordIds.size > 0 && (
                                <button onClick={() => handleRestart(true)} className="px-8 py-3 bg-rose-500 text-white rounded-full font-bold shadow-lg hover:bg-rose-600 transition w-full sm:w-auto flex items-center justify-center gap-2">
                                    <span>🔁</span> {wrongWordIds.size}件を復習する
                                </button>
                            )}
                            {reviewWords && wrongWordIds.size === 0 && (
                                <button onClick={handleRetryCurrentSession} className="px-8 py-3 bg-indigo-600 text-white rounded-full font-bold shadow-lg hover:bg-indigo-700 transition w-full sm:w-auto flex items-center justify-center gap-2">
                                    <span>↺</span> もう一度学習する
                                </button>
                            )}
                            <button onClick={() => setMode('list')} className="px-8 py-3 bg-neutral-800 border border-neutral-700 rounded-full font-bold hover:bg-neutral-700 transition w-full sm:w-auto text-center">単語一覧に戻る</button>
                        </div>
                    </div>
                </div>
            );
        }

        const getSessionWords = () => {
            if (reviewWords) return reviewWords;

            const source = isRandomMode ? shuffledWords : sortedWords;
            const active = includeMastered ? source : source.filter(w => !w.isMastered);

            // If active is empty but source is not, it means all remaining are mastered.
            // If includeMastered is false, we should have probably alerted in handleRestart, 
            // but if we are just rendering, safe fallback is show nothing or show all? 
            // Logic in handleRestart attempts to handle empty active words.

            return active.length > 0 ? active : source;
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
            <div className="min-h-screen bg-[#050505] text-neutral-100 p-6 flex flex-col">
                <header className="flex justify-between items-center mb-8 max-w-4xl mx-auto w-full">
                    <button onClick={() => setMode('list')} className="text-neutral-400 hover:text-white transition font-bold text-sm">✕ 閉じる</button>
                    <div className="text-center">
                        <h1 className="font-bold text-lg text-white/90">{reviewWords ? 'Mistake Review' : deck.title}</h1>
                        <p className="text-xs text-neutral-400 font-mono mt-1">{currentIndex + 1} / {displayWords.length}</p>
                    </div>
                    <div className="w-20"></div>
                </header>

                <main className="flex-1 flex flex-col items-center justify-start mt-4 sm:mt-12 perspective-1000 w-full max-w-2xl mx-auto overflow-hidden">
                    <motion.div
                        key={currentIndex}
                        {...(bindCardDrag() as any)}
                        style={{ x: cardX, y: cardY, rotate: cardRotate, opacity: cardOpacity } as any}
                        animate={swipeControls}
                        className="relative w-full h-[360px] sm:h-[420px] max-w-md sm:max-w-2xl mx-auto cursor-pointer group touch-none"
                        onClick={() => {
                            if (Math.abs(cardX.get()) < 5) {
                                setIsFlipped(!isFlipped);
                                if (!isFlipped) setFlippedIndices(prev => new Set(prev).add(currentIndex));
                            }
                        }}
                    >
                        {/* Swipe Feedbacks */}
                        <motion.div
                            style={{ opacity: rightOverlayOpacity } as any}
                            className="absolute top-8 left-8 z-40 border-4 border-green-500 text-green-500 font-black text-4xl rounded-xl px-4 py-2 transform -rotate-12 pointer-events-none bg-black/20 backdrop-blur-sm"
                        >
                            GOT IT
                        </motion.div>
                        <motion.div
                            style={{ opacity: leftOverlayOpacity } as any}
                            className="absolute top-8 right-8 z-40 border-4 border-rose-500 text-rose-500 font-black text-4xl rounded-xl px-4 py-2 transform rotate-12 pointer-events-none bg-black/20 backdrop-blur-sm"
                        >
                            REVIEW
                        </motion.div>

                        <div className={`absolute inset-0 w-full h-full duration-500 preserve-3d transition-transform ${isFlipped ? "rotate-y-180" : ""}`}>
                            {/* Front */}
                            <div className="absolute inset-0 backface-hidden bg-[#1e1e1e] rounded-3xl shadow-xl border border-neutral-800 grid grid-rows-[1fr_auto_1fr]">
                                <div className="flex flex-col justify-end items-center pb-4">
                                    <span className="text-xs font-bold text-neutral-400 uppercase tracking-widest">単語</span>
                                </div>
                                <div className="flex items-center justify-center min-h-[80px] px-4 relative w-full overflow-hidden">
                                    <h2 className={`${currentCard.word.length > 18 ? 'text-[1.3rem] sm:text-2xl tracking-tighter' :
                                        currentCard.word.length > 14 ? 'text-2xl sm:text-3xl tracking-tight' :
                                            currentCard.word.length > 10 ? 'text-4xl sm:text-5xl' :
                                                'text-5xl sm:text-6xl'
                                        } font-black text-center mb-0 whitespace-normal break-words leading-snug w-full px-6 pr-14 sm:px-12 sm:pr-20`} style={{ fontFamily: 'var(--font-merriweather)' }}>
                                        {currentCard.word}
                                    </h2>
                                    {/* 音声再生ボタン (Front) */}
                                    <button
                                        onClick={(e) => { e.stopPropagation(); speak(currentCard.word); }}
                                        className="absolute right-4 sm:right-8 p-3 bg-neutral-100 dark:bg-neutral-800 rounded-full hover:bg-indigo-100 dark:hover:bg-indigo-900 text-indigo-500 transition-colors pointer-events-auto shadow-sm"
                                        title="音声を再生"
                                    >
                                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
                                    </button>
                                </div>
                                <div className="relative flex flex-col justify-start pt-4 items-center">
                                    <p className="absolute bottom-8 text-neutral-300 dark:text-neutral-600 text-xs font-bold animate-pulse">クリックして反転 ↻</p>
                                </div>
                            </div>
                            {/* Back */}
                            <div className="absolute inset-0 backface-hidden rotate-y-180 bg-indigo-600 dark:bg-indigo-900 text-white rounded-3xl shadow-xl overflow-hidden grid grid-rows-[1fr_auto_1fr]">
                                {/* Mistake Tagging */}
                                <button
                                    onClick={(e) => currentCard.id && toggleWrongWord(currentCard.id, e)}
                                    className={`absolute top-4 right-4 z-20 p-2 rounded-xl transition-all ${currentCard.id && wrongWordIds.has(currentCard.id)
                                        ? 'bg-rose-500 text-white scale-110 shadow-lg'
                                        : 'bg-white/10 text-white/40 hover:bg-white/20'
                                        }`}
                                    title="Mark as mistake"
                                >
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                                    <p className="text-[10px] mt-1 font-bold text-center">復習リスト</p>
                                </button>

                                <div className="flex flex-col justify-end items-center pb-4 relative z-10 pointer-events-none">
                                    <span className="text-xs font-bold text-indigo-200 uppercase tracking-widest border-b border-indigo-400/30 pb-1">意味</span>
                                </div>
                                <div className="flex items-center justify-center min-h-[80px] px-4 sm:px-12 relative z-10 pointer-events-none w-full overflow-hidden mb-6">
                                    <h3 className={`${currentCard.meaning.length > 20 ? 'text-lg sm:text-xl tracking-tighter' :
                                        currentCard.meaning.length > 15 ? 'text-xl sm:text-2xl tracking-tight' :
                                            currentCard.meaning.length > 10 ? 'text-2xl sm:text-3xl' :
                                                'text-3xl sm:text-4xl'
                                        } font-bold mb-0 text-center whitespace-pre-wrap w-full`} style={{ fontFamily: 'var(--font-noto-serif-jp)' }}>
                                        {formatMeaningText(currentCard.meaning)}
                                    </h3>
                                </div>

                                {/* 例文セクション */}
                                <div className="flex flex-col justify-start items-center pt-8 pb-4 px-4 w-full min-h-0 relative z-20 pointer-events-auto">
                                    {(currentCard.otherExamples && currentCard.otherExamples.length > 0) ? (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setShowExamples(true); }}
                                            className="px-8 py-3 bg-white/10 hover:bg-white/20 rounded-full text-sm font-bold border border-white/20 backdrop-blur-sm transition-all shadow-md flex items-center gap-2"
                                        >
                                            <span>📖</span> 例文を見る
                                        </button>
                                    ) : (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (currentCard.id) handleGenerateDetails(currentCard.id);
                                            }}
                                            className="px-8 py-3 bg-amber-400 hover:bg-amber-300 text-amber-900 rounded-full text-sm font-bold shadow-lg transition-all flex items-center gap-2"
                                        >
                                            <span>🪄</span> 例文を生成
                                        </button>
                                    )}
                                </div>

                                {/* 例文フルオーバーレイモード */}
                                {showExamples && (
                                    <div className="absolute inset-0 z-30 bg-indigo-900 flex flex-col pt-16 pb-6 px-6 sm:px-12 animate-in fade-in duration-200" onClick={(e) => e.stopPropagation()}>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setShowExamples(false); }}
                                            className="absolute top-4 right-4 p-2 text-indigo-300 hover:text-white bg-indigo-800/50 hover:bg-indigo-700 rounded-full transition-colors flex items-center gap-2 pr-4 z-30"
                                        >
                                            <span className="text-sm font-bold">✕ 戻る</span>
                                        </button>

                                        <div className="overflow-y-auto flex-1 space-y-6 pr-4 scrollbar-thin scrollbar-thumb-indigo-500 scrollbar-track-transparent">
                                            <h4 className="text-xl font-black text-indigo-100 mb-6 border-b border-indigo-700/50 pb-4 sticky top-0 bg-indigo-900/90 backdrop-blur-sm z-10 pt-2">例文・フレーズ</h4>

                                            {currentCard.otherExamples?.filter((ex: any) => ex.text.trim() !== "").map((ex: any, i: number) => (
                                                <div key={i} className="text-left bg-indigo-800/30 rounded-2xl p-5 border border-indigo-700/30 shadow-sm relative overflow-hidden group hover:bg-indigo-800/50 transition-colors">
                                                    <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-indigo-400"></div>
                                                    <span className="text-[10px] uppercase font-black px-2 py-0.5 rounded-md bg-indigo-800 text-indigo-200 tracking-widest mb-3 inline-block">{ex.role}</span>
                                                    <div className="flex gap-2 items-start">
                                                        <div>
                                                            <p className="text-[1.1rem] sm:text-xl font-serif text-white leading-relaxed tracking-wide">{ex.text}</p>
                                                            {ex.translation && <p className="text-sm sm:text-base text-indigo-200/80 font-medium mt-3 border-t border-indigo-700/30 pt-3">{ex.translation}</p>}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                            <div className="h-4"></div> {/* Bottom padding for scroll */}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </motion.div>
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



    // --- Dictation Mode ---
    if (mode === 'dictation') {
        if (isFinished) {
            return (
                <div className="min-h-screen flex flex-col items-center justify-center bg-[#050505] p-6">
                    <div className="text-center space-y-6 animate-in zoom-in duration-300">
                        <div className="text-6xl mb-4">🎧</div>
                        <h1 className="text-3xl font-bold text-white">ディクテーション終了！</h1>
                        <p className="text-neutral-500">"{deck.title}" の書き取り練習が完了しました。</p>
                        {earnedXp > 0 && (
                            <div className="animate-bounce mt-4 inline-block px-6 py-2 bg-yellow-400 text-yellow-900 font-black rounded-full shadow-lg transform rotate-[-2deg]">
                                + {earnedXp} XP GET!
                            </div>
                        )}
                        <div className="flex flex-col sm:flex-row flex-wrap gap-4 justify-center items-center mt-8 w-full max-w-2xl mx-auto">
                            <button onClick={() => handleRestart(false)} className="px-8 py-3 bg-indigo-600 text-white rounded-full font-bold shadow-lg hover:bg-indigo-700 transition w-full sm:w-auto text-center">最初から学習する</button>
                            {wrongWordIds.size > 0 && (
                                <button onClick={() => handleRestart(true)} className="px-8 py-3 bg-rose-500 text-white rounded-full font-bold shadow-lg hover:bg-rose-600 transition w-full sm:w-auto flex items-center justify-center gap-2">
                                    <span>🔁</span> {wrongWordIds.size}件を復習する
                                </button>
                            )}
                            {reviewWords && wrongWordIds.size === 0 && (
                                <button onClick={handleRetryCurrentSession} className="px-8 py-3 bg-indigo-600 text-white rounded-full font-bold shadow-lg hover:bg-indigo-700 transition w-full sm:w-auto flex items-center justify-center gap-2">
                                    <span>↺</span> もう一度学習する
                                </button>
                            )}
                            <button onClick={() => setMode('list')} className="px-8 py-3 bg-neutral-800 border border-neutral-700 rounded-full font-bold hover:bg-neutral-700 transition w-full sm:w-auto text-center">単語一覧に戻る</button>
                        </div>
                    </div>
                </div>
            );
        }

        const displayWords = getSessionWords();
        const currentCard = displayWords[currentIndex];

        if (!currentCard) return null;

        return (
            <div className="min-h-screen bg-[#050505] text-neutral-100 p-6 flex flex-col">
                <header className="flex justify-between items-center mb-8 max-w-4xl mx-auto w-full">
                    <button onClick={() => setMode('list')} className="text-neutral-400 hover:text-white transition font-bold text-sm">✕ キャンセル</button>
                    <div className="text-center">
                        <h1 className="font-bold text-lg text-white/90">Dictation</h1>
                        <p className="text-xs text-neutral-400 font-mono mt-1">{currentIndex + 1} / {displayWords.length}</p>
                    </div>
                    <div className="w-20"></div>
                </header>

                <main className="flex-1 flex flex-col items-center justify-start mt-4 sm:mt-12 w-full max-w-2xl mx-auto">
                    <div className="w-full bg-[#1e1e1e] rounded-3xl shadow-xl p-8 sm:p-12 border border-neutral-800 flex flex-col items-center relative overflow-hidden">

                        {/* Audio Visualizer / Button */}
                        {/* Question Display (Fill-in) or Audio Visualizer (Word/Full) */}
                        {challengeType === 'fill-in' && activeExample ? (
                            <div className="mb-10 w-full text-left space-y-6">
                                {/* Japanese */}

                                {/* English (Fill-in) */}
                                <div className="space-y-1">
                                    <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider block">ENGLISH</span>
                                    <div className="p-5 pr-16 sm:pr-20 bg-neutral-800/50 rounded-2xl text-xl sm:text-2xl font-serif text-neutral-300 leading-relaxed relative group">
                                        <button
                                            onClick={() => speak(activeExample.text)}
                                            className="absolute top-4 right-4 p-3 bg-indigo-600/20 text-indigo-400 rounded-full hover:bg-indigo-600 hover:text-white transition-all shadow-sm"
                                            title="Play Audio"
                                        >
                                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
                                        </button>
                                        {(() => {
                                            const normalizedText = activeExample.text;
                                            const targetObj = activeExample.targetMatch || { matchedString: currentCard.word, suffixToKeep: '', corePhrase: currentCard.word };
                                            const matchStr = targetObj.matchedString;

                                            if (!normalizedText.toLowerCase().includes(matchStr.toLowerCase())) {
                                                return <span>{activeExample.text} <span className="text-neutral-500 text-sm">(Term not found in example)</span></span>
                                            }

                                            // Split text using the exact matched string form
                                            const parts = normalizedText.split(new RegExp(`(${matchStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));

                                            return parts.map((part, i) => (
                                                part.toLowerCase() === matchStr.toLowerCase() ? (
                                                    <span key={i} className="inline-flex items-baseline">
                                                        <span className="inline-block min-w-[3ch] text-indigo-500 border-b-2 border-indigo-500/50 px-1 mx-1 font-mono bg-indigo-500/10 rounded">
                                                            [{' '.repeat(targetObj.corePhrase.length)}]
                                                        </span>
                                                        {targetObj.suffixToKeep && (
                                                            <span className="text-neutral-300 font-bold">{targetObj.suffixToKeep}</span>
                                                        )}
                                                    </span>
                                                ) : (
                                                    <span key={i}>{part}</span>
                                                )
                                            ));
                                        })()}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="mb-12 text-center relative group py-8">
                                <div className="absolute inset-0 bg-indigo-500/20 blur-2xl rounded-full scale-150 animate-pulse"></div>
                                <button
                                    onClick={() => speak(challengeType !== 'word' && activeExample ? activeExample.text : currentCard.word)}
                                    className="relative w-48 h-48 bg-indigo-600 text-white rounded-full flex items-center justify-center shadow-2xl shadow-indigo-500/40 hover:scale-105 active:scale-95 transition-all group-hover:bg-indigo-500"
                                >
                                    <svg className="ml-2" width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
                                </button>
                            </div>
                        )}

                        {/* Hint Display */}
                        {challengeType !== 'full' && !isAnswerChecked && (
                            <div className="mb-8 h-8 flex items-center justify-center">
                                {showHint ? (
                                    <div className="text-center animate-in fade-in slide-in-from-bottom-2">
                                        <p className="text-sm font-bold text-neutral-400 mb-1">最初の文字:</p>
                                        <p className="text-4xl font-black text-indigo-500 font-mono">{currentCard.word.charAt(0)}...</p>
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => setShowHint(true)}
                                        className="text-sm font-bold text-neutral-400 hover:text-indigo-500 transition flex items-center gap-1 bg-neutral-100 dark:bg-neutral-800 px-3 py-1.5 rounded-full"
                                    >
                                        <span>💡</span> ヒントを見る
                                    </button>
                                )}
                            </div>
                        )}

                        <div className="w-full max-w-md flex flex-col gap-6 z-10">
                            {(!isAnswerChecked || writingInput.trim() !== '') && (
                                <input
                                    autoFocus
                                    type="text"
                                    value={writingInput}
                                    onChange={(e) => setWritingInput(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && !isAnswerChecked && handleCheckAnswer(currentCard.id, currentCard.word, activeExample?.text || currentCard.example, activeExample?.targetMatch?.corePhrase)}
                                    disabled={isAnswerChecked}
                                    placeholder={challengeType === 'full' ? "全文を入力" : ""}
                                    className={`order-2 w-full p-4 text-xl sm:text-2xl font-bold text-center bg-black text-white border-2 rounded-2xl focus:outline-none transition-all ${isAnswerChecked
                                        ? isCorrect
                                            ? 'border-green-500 bg-green-950/20 text-green-600'
                                            : 'border-red-500 bg-red-950/20 text-red-600'
                                        : 'border-neutral-800 focus:border-indigo-500'
                                        }`}
                                />
                            )}

                            {isAnswerChecked && (
                                <>
                                    {!isCorrect && (
                                        <div className="order-1 animate-in slide-in-from-top-2 duration-300 w-full mb-2">
                                            <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-2 text-center">正解:</p>
                                            {challengeType === 'word' ? (
                                                <div className="bg-neutral-800 p-4 rounded-xl text-center">
                                                    <p className="text-3xl font-black text-indigo-400 font-serif mb-2">{currentCard.word}</p>
                                                    <p className="text-sm text-neutral-500 font-bold whitespace-pre-wrap">{formatMeaningText(currentCard.meaning)}</p>
                                                </div>
                                            ) : (
                                                <div className="bg-neutral-800 p-4 rounded-xl text-left">
                                                    <p className="text-lg text-indigo-400 font-serif font-bold mb-2">{activeExample?.text || currentCard.example}</p>
                                                    <p className="text-sm text-neutral-400 font-bold mb-2">{activeExample?.translation || currentCard.example_jp}</p>
                                                    <p className="text-sm text-neutral-500 border-t border-neutral-700 pt-2">{currentCard.word} (<span className="whitespace-pre-wrap">{formatMeaningText(currentCard.meaning)}</span>)</p>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                    <div className="order-3 animate-in slide-in-from-top-2 duration-300 text-center w-full">
                                        {isCorrect && (
                                            <p className="text-sm text-neutral-500 mb-4 font-bold whitespace-pre-wrap">{formatMeaningText(currentCard.meaning)}</p>
                                        )}
                                        <div className="flex flex-col items-center gap-2">
                                            <p className={`text-xl font-black ${isCorrect ? 'text-green-500' : 'text-red-500'}`}>
                                                {isCorrect ? '✨ 正解！' : '📌 おしい！'}
                                            </p>
                                            <button
                                                onClick={handleWritingNext}
                                                autoFocus
                                                className="mt-4 px-12 py-3 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-full font-bold shadow-lg hover:scale-105 active:scale-95 transition-all w-full sm:w-auto"
                                            >
                                                次へ進む
                                            </button>
                                        </div>
                                    </div>
                                </>
                            )}

                            {!isAnswerChecked && (
                                <div className="order-3 space-y-4 w-full">
                                    <button
                                        onClick={() => handleCheckAnswer(currentCard.id, currentCard.word, activeExample?.text || currentCard.example, activeExample?.targetMatch?.corePhrase)}
                                        disabled={!writingInput.trim()}
                                        className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold text-lg shadow-lg shadow-indigo-500/30 hover:bg-indigo-700 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        回答をチェック
                                    </button>
                                    <button
                                        onClick={() => handleSkip(currentCard.id)}
                                        className="w-full py-2 text-neutral-500 font-bold hover:text-indigo-400 transition-colors text-sm"
                                    >
                                        分からない / パス
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </main>
            </div>
        );
    }

    // --- Writing Test Mode ---
    if (mode === 'writing_test') {
        if (isFinished) {
            return (
                <div className="min-h-screen flex flex-col items-center justify-center bg-[#050505] p-6">
                    <div className="text-center space-y-6 animate-in zoom-in duration-300">
                        <div className="text-6xl mb-4">📝</div>
                        <h1 className="text-3xl font-bold text-white">テスト終了！</h1>
                        <p className="text-neutral-500">"{deck.title}" のテストが完了しました。</p>
                        {earnedXp > 0 && (
                            <div className="animate-bounce mt-4 inline-block px-6 py-2 bg-yellow-400 text-yellow-900 font-black rounded-full shadow-lg transform rotate-[-2deg]">
                                + {earnedXp} XP GET!
                            </div>
                        )}
                        <div className="flex flex-col sm:flex-row flex-wrap gap-4 justify-center items-center mt-8 w-full max-w-2xl mx-auto">
                            <button onClick={() => handleRestart(false)} className="px-8 py-3 bg-indigo-600 text-white rounded-full font-bold shadow-lg hover:bg-indigo-700 transition w-full sm:w-auto text-center">最初から学習する</button>
                            {wrongWordIds.size > 0 && (
                                <button onClick={() => handleRestart(true)} className="px-8 py-3 bg-rose-500 text-white rounded-full font-bold shadow-lg hover:bg-rose-600 transition w-full sm:w-auto flex items-center justify-center gap-2">
                                    <span>🔁</span> {wrongWordIds.size}件を復習する
                                </button>
                            )}
                            {reviewWords && wrongWordIds.size === 0 && (
                                <button onClick={handleRetryCurrentSession} className="px-8 py-3 bg-indigo-600 text-white rounded-full font-bold shadow-lg hover:bg-indigo-700 transition w-full sm:w-auto flex items-center justify-center gap-2">
                                    <span>↺</span> もう一度学習する
                                </button>
                            )}
                            <button onClick={() => setMode('list')} className="px-8 py-3 bg-neutral-800 border border-neutral-700 rounded-full font-bold hover:bg-neutral-700 transition w-full sm:w-auto text-center">単語一覧に戻る</button>
                        </div>
                    </div>
                </div>
            );
        }

        const displayWords = getSessionWords();
        const currentCard = displayWords[currentIndex];

        if (!currentCard) return null;

        return (
            <div className="min-h-screen bg-[#050505] text-neutral-100 p-6 flex flex-col">
                <header className="flex justify-between items-center mb-8 max-w-4xl mx-auto w-full">
                    <button onClick={() => setMode('list')} className="text-neutral-400 hover:text-white transition font-bold text-sm">✕ キャンセル</button>
                    <div className="text-center">
                        <h1 className="font-bold text-lg text-white/90">
                            {reviewWords ? 'Mistake Review' : 'Writing'}
                        </h1>
                        <p className="text-xs text-neutral-400 font-mono mt-1">{currentIndex + 1} / {displayWords.length}</p>
                    </div>
                    <div className="w-20"></div>
                </header >

                <main className="flex-1 flex flex-col items-center justify-start mt-4 sm:mt-12 w-full max-w-2xl mx-auto">
                    <div className="w-full bg-[#1e1e1e] rounded-3xl shadow-xl p-8 sm:p-12 border border-neutral-800 flex flex-col items-center">
                        <span className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-6 border-b border-neutral-100 dark:border-neutral-800 pb-1 text-center">
                            {challengeType === 'full' ? "日本語に合う英文を全て入力してください" :
                                challengeType === 'fill-in' ? "日本語に合う英文を完成させてください" :
                                    "この意味を持つ単語は？"}
                        </span>

                        {challengeType !== 'word' && activeExample ? (
                            <div className="mb-10 w-full max-w-xl text-left space-y-6">
                                {/* Japanese */}
                                <div className="space-y-1">
                                    <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider block">日本語</span>
                                    <h3 className="text-xl sm:text-2xl font-bold text-white leading-relaxed font-serif">
                                        「{activeExample.translation}」
                                    </h3>
                                </div>

                                {/* English (Fill-in) */}
                                {challengeType === 'fill-in' && (
                                    <div className="space-y-1">
                                        <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider block">English</span>
                                        <div className="p-5 bg-neutral-800/50 border border-neutral-700/50 rounded-2xl text-lg sm:text-xl font-serif text-neutral-300 leading-relaxed shadow-inner">
                                            {(() => {
                                                const normalizedText = activeExample.text;
                                                const targetObj = activeExample.targetMatch || { matchedString: currentCard.word, suffixToKeep: '', corePhrase: currentCard.word };
                                                const matchStr = targetObj.matchedString;

                                                if (!normalizedText.toLowerCase().includes(matchStr.toLowerCase())) {
                                                    return <span>{activeExample.text} <span className="text-neutral-500 text-sm">(Term not found in example)</span></span>
                                                }

                                                // Split text using the exact matched string form
                                                const parts = normalizedText.split(new RegExp(`(${matchStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));

                                                return parts.map((part, i) => (
                                                    part.toLowerCase() === matchStr.toLowerCase() ? (
                                                        <span key={i} className="inline-flex items-baseline">
                                                            <span className="inline-block min-w-[3ch] text-indigo-500 border-b-2 border-indigo-500/50 px-1 mx-1 font-mono bg-indigo-500/10 rounded">
                                                                [{' '.repeat(targetObj.corePhrase.length)}]
                                                            </span>
                                                            {targetObj.suffixToKeep && (
                                                                <span className="text-neutral-300 font-bold">{targetObj.suffixToKeep}</span>
                                                            )}
                                                        </span>
                                                    ) : (
                                                        <span key={i}>{part}</span>
                                                    )
                                                ));
                                            })()}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <h3 className="text-3xl sm:text-4xl font-bold mb-12 text-center whitespace-pre-wrap" style={{ fontFamily: 'var(--font-noto-serif-jp)' }}>{formatMeaningText(currentCard.meaning)}</h3>
                        )}

                        {/* Hint Display */}
                        {challengeType !== 'full' && !isAnswerChecked && (
                            <div className="mb-6 h-8 flex items-center justify-center">
                                {showHint ? (
                                    <div className="text-center animate-in fade-in slide-in-from-bottom-2">
                                        <p className="text-sm font-bold text-neutral-400 mb-1">最初の文字:</p>
                                        <p className="text-4xl font-black text-indigo-500 font-mono">{currentCard.word.charAt(0)}...</p>
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => setShowHint(true)}
                                        className="text-sm font-bold text-neutral-400 hover:text-indigo-500 transition flex items-center gap-1"
                                    >
                                        <span>💡</span> ヒントを見る
                                    </button>
                                )}
                            </div>
                        )}

                        <div className="w-full max-w-md flex flex-col gap-6 z-10 w-full">
                            {(!isAnswerChecked || writingInput.trim() !== '') && (
                                <input
                                    autoFocus
                                    type="text"
                                    value={writingInput}
                                    onChange={(e) => setWritingInput(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && !isAnswerChecked && handleCheckAnswer(currentCard.id, currentCard.word, activeExample?.text || currentCard.example, activeExample?.targetMatch?.corePhrase)}
                                    disabled={isAnswerChecked}
                                    placeholder={challengeType === 'full' ? "全文を入力" : ""}
                                    className={`order-2 w-full p-4 text-xl sm:text-2xl font-bold text-center bg-black text-white border-2 rounded-2xl focus:outline-none transition-all ${isAnswerChecked
                                        ? isCorrect
                                            ? 'border-green-500 bg-green-950/20 text-green-600'
                                            : 'border-red-500 bg-red-950/20 text-red-600'
                                        : 'border-neutral-800 focus:border-indigo-500'
                                        }`}
                                />
                            )}

                            {isAnswerChecked && (
                                <>
                                    {!isCorrect && (
                                        <div className="order-1 animate-in slide-in-from-top-2 duration-300 w-full mb-2">
                                            <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-2 text-center">正解:</p>
                                            {challengeType === 'word' ? (
                                                <div className="bg-neutral-800 p-4 rounded-xl text-center">
                                                    <p className="text-3xl font-black text-indigo-400 font-serif mb-2">{currentCard.word}</p>
                                                    <p className="text-sm text-neutral-500 font-bold whitespace-pre-wrap">{formatMeaningText(currentCard.meaning)}</p>
                                                </div>
                                            ) : (
                                                <div className="bg-neutral-800 p-4 rounded-xl text-left">
                                                    <p className="text-lg text-indigo-400 font-serif font-bold mb-2">{activeExample?.text || currentCard.example}</p>
                                                    <p className="text-sm text-neutral-400 font-bold mb-2">{activeExample?.translation || currentCard.example_jp}</p>
                                                    <p className="text-sm text-neutral-500 border-t border-neutral-700 pt-2">{currentCard.word} (<span className="whitespace-pre-wrap">{formatMeaningText(currentCard.meaning)}</span>)</p>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                    <div className="order-3 animate-in slide-in-from-top-2 duration-300 text-center w-full">
                                        {isCorrect && (
                                            <p className="text-sm text-neutral-500 mb-4 font-bold whitespace-pre-wrap">{formatMeaningText(currentCard.meaning)}</p>
                                        )}
                                        <div className="flex flex-col items-center gap-2">
                                            <p className={`text-xl font-black ${isCorrect ? 'text-green-500' : 'text-red-500'}`}>
                                                {isCorrect ? '✨ 正解！' : '📌 おしい！'}
                                            </p>
                                            <button
                                                onClick={handleWritingNext}
                                                autoFocus
                                                className="mt-4 px-12 py-3 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-full font-bold shadow-lg hover:scale-105 active:scale-95 transition-all w-full sm:w-auto"
                                            >
                                                次へ進む
                                            </button>
                                        </div>
                                    </div>
                                </>
                            )}

                            {!isAnswerChecked && (
                                <div className="order-3 space-y-4 w-full">
                                    <button
                                        onClick={() => handleCheckAnswer(currentCard.id, currentCard.word, activeExample?.text || currentCard.example, activeExample?.targetMatch?.corePhrase)}
                                        disabled={!writingInput.trim()}
                                        className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold text-lg shadow-lg shadow-indigo-500/30 hover:bg-indigo-700 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        回答をチェック
                                    </button>
                                    <button
                                        onClick={() => handleSkip(currentCard.id)}
                                        className="w-full py-2 text-neutral-500 font-bold hover:text-indigo-400 transition-colors text-sm"
                                    >
                                        分からない / パス
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </main>
            </div >
        );
    }
    return (
        <div className="flex-1 flex flex-col bg-neutral-900 md:bg-black text-neutral-100 p-6 md:p-12 pb-0 md:pb-0 font-sans transition-colors duration-300">
            <header className="max-w-4xl mx-auto w-full flex items-center justify-between mb-2 md:mb-8 shrink-0 px-2 md:px-0">
                <Link href={from === 'home' ? "/" : "/#saved"} className="p-2 md:px-4 md:py-2 text-sm font-bold text-neutral-500 hover:bg-neutral-800 rounded-lg transition-colors flex items-center gap-1">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
                    <span className="hidden md:inline">{from === 'home' ? "ホームに戻る" : "保存した単語帳に戻る"}</span>
                </Link>
                <button
                    onClick={handleDeleteDeck}
                    className="p-2 md:px-4 md:py-2 text-xs font-bold text-red-400 hover:text-red-600 hover:bg-neutral-800 rounded-lg transition-all flex items-center gap-2"
                >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                    <span className="hidden md:inline">単語帳を削除</span>
                </button>
            </header>

            <main className="max-w-4xl mx-auto w-full flex-1 flex flex-col">
                {/* Cover / Info */}
                <div className="flex-1 md:flex-none rounded-none md:rounded-[2rem] md:bg-[#131313] px-6 pt-4 pb-12 md:p-16 mb-0 md:mb-8 text-center flex flex-col items-center justify-center gap-8 -mx-6 md:mx-0 transition-all duration-500">
                    <div className="w-full relative z-10 flex flex-col items-center">
                        {isEditingTitle ? (
                            <div className="flex items-center justify-center gap-3 w-full animate-in fade-in slide-in-from-top-2 duration-200">
                                <input
                                    autoFocus
                                    value={editTitle}
                                    onChange={(e) => setEditTitle(e.target.value)}
                                    className="flex-1 min-w-[200px] text-center text-3xl sm:text-5xl font-black bg-transparent border-b-4 border-indigo-500 px-1 py-1 focus:outline-none text-neutral-100 placeholder-neutral-500"
                                    placeholder="タイトルを入力"
                                    onKeyDown={(e) => e.key === 'Enter' && handleUpdateTitle()}
                                />
                                <div className="flex items-center gap-2 shrink-0">
                                    <button
                                        onClick={handleUpdateTitle}
                                        className="p-3 bg-indigo-600 text-white rounded-xl shadow-lg hover:bg-indigo-700 hover:scale-105 transition-all active:scale-95"
                                        title="保存"
                                    >
                                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                    </button>
                                    <button
                                        onClick={() => setIsEditingTitle(false)}
                                        className="p-3 bg-neutral-800 text-neutral-400 rounded-xl hover:bg-neutral-700 transition-all active:scale-95"
                                        title="キャンセル"
                                    >
                                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div
                                className="group flex items-center justify-center gap-4 cursor-pointer p-4 -m-4 rounded-2xl transition-all"
                                onClick={() => { setIsEditingTitle(true); setEditTitle(deck.title); }}
                            >
                                {/* Balancing spacer to keep title centered */}
                                <div className="w-10 shrink-0"></div>

                                <h1 className="text-4xl sm:text-6xl font-black mb-0 leading-tight text-white drop-shadow-2xl text-center tracking-tight group-hover:text-indigo-300 transition-colors flex-1">
                                    <span style={{ fontFamily: 'var(--font-merriweather), var(--font-noto-serif-jp), serif' }}>{deck.title}</span>
                                </h1>
                                <div className="p-2 rounded-xl text-neutral-500 hover:text-indigo-400 hover:bg-neutral-800/80 transition-all shrink-0 w-10 flex items-center justify-center">
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                                </div>
                            </div>
                        )}

                        {/* Glassmorphism Stats Pill */}
                        <div className="mt-8 px-6 py-3 rounded-2xl bg-white/[0.03] backdrop-blur-md border border-white/[0.08] shadow-2xl flex flex-col sm:flex-row items-center gap-y-2 sm:gap-x-8 transition-all hover:bg-white/[0.05] hover:border-white/[0.12]">
                            <div className="flex items-center gap-2 text-neutral-400">
                                <span className="text-[11px] font-bold font-mono tracking-wider"><span className="text-sm text-neutral-200">{deck.words.length}</span> <span className="font-normal opacity-60">WORDS</span></span>
                            </div>
                            <div className="hidden sm:block w-px h-4 bg-white/[0.1]"></div>
                            <div className="flex items-center gap-2 text-neutral-300 font-bold text-xs uppercase tracking-wide">
                                <span className="text-base">🔥</span> <span className="opacity-70">学習回数:</span> <span className="text-indigo-400 text-sm">{deck.study_count ?? 0}</span><span className="text-[10px] opacity-60">回</span>
                            </div>
                            <div className="hidden sm:block w-px h-4 bg-white/[0.1]"></div>
                            <div className="flex items-center gap-2 text-neutral-400 font-bold text-xs uppercase tracking-wide">
                                <span className="text-base">📅</span> <span className="opacity-70">最終学習:</span> <span className="text-neutral-200">{lastStudiedText}</span>
                            </div>
                        </div>
                    </div>

                    {deck.words.length > 0 && (
                        <div className="flex flex-col gap-4 w-full shrink-0">
                            {/* Learning Options Group */}
                            <div className="bg-white/5 border-y sm:border border-neutral-800/50 rounded-none sm:rounded-2xl p-4 sm:p-5 -mx-6 sm:mx-0 flex flex-col sm:flex-row justify-between items-center gap-4 mb-2">
                                <div className="flex flex-col items-center sm:items-start gap-2">
                                    <span className="text-[10px] font-black uppercase text-neutral-500 tracking-widest ml-1">出題順</span>
                                    <div className="flex items-center gap-1 bg-black/40 p-1 rounded-xl w-fit">
                                        <button
                                            onClick={() => setIsRandomMode(false)}
                                            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${!isRandomMode ? 'bg-indigo-600 shadow-md text-white' : 'text-neutral-500 hover:text-neutral-300'}`}
                                        >
                                            🔢 順序通り
                                        </button>
                                        <button
                                            onClick={() => {
                                                if (deck) setShuffledWords(shuffleArray(sortedWords));
                                                setIsRandomMode(true);
                                            }}
                                            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${isRandomMode ? 'bg-indigo-600 shadow-md text-white' : 'text-neutral-500 hover:text-neutral-300'}`}
                                        >
                                            🔀 ランダム
                                        </button>
                                    </div>
                                </div>

                                <div className="flex flex-col items-center sm:items-end gap-2">
                                    <span className="text-[10px] font-black uppercase text-neutral-500 tracking-widest mr-1">学習対象</span>
                                    <label className="flex items-center gap-3 cursor-pointer select-none px-4 py-2 rounded-xl bg-black/40 hover:bg-black/60 transition border border-white/5">
                                        <input
                                            type="checkbox"
                                            checked={includeMastered}
                                            onChange={(e) => setIncludeMastered(e.target.checked)}
                                            className="w-4 h-4 rounded border-neutral-700 text-indigo-600 focus:ring-indigo-500"
                                        />
                                        <span className="text-xs font-bold text-neutral-300 whitespace-nowrap">✓ 済みも含める</span>
                                    </label>
                                </div>
                            </div>

                            {/* Learning Mode Cards */}
                            <div className="flex flex-col gap-4 w-full max-w-xl mx-auto mt-2">
                                {/* Count increment info banner */}
                                <div className="bg-indigo-900/10 border border-indigo-500/30 rounded-2xl px-5 py-3 flex items-start gap-3 animate-in fade-in slide-in-from-top-2 duration-500">
                                    <span className="text-xl">✨</span>
                                    <p className="text-xs sm:text-sm font-bold text-indigo-300 leading-relaxed">
                                        フラッシュカード、ライティング、ディクテーションを最後まで完了すると、学習回数がカウントされます。
                                    </p>
                                </div>
                                {/* Flashcard Card */}
                                <button
                                    onClick={() => { handleRestart(); setMode('flashcard'); }}
                                    className="w-full bg-neutral-800/80 border-2 border-neutral-700/50 rounded-3xl p-5 flex items-center gap-5 hover:bg-neutral-700/80 hover:border-indigo-500/50 transition-all active:scale-[0.98] shadow-lg group"
                                >
                                    <span className="text-4xl bg-neutral-900/50 p-3 rounded-2xl group-hover:scale-110 transition-transform">🎴</span>
                                    <div className="flex-1 text-left">
                                        <h3 className="text-xl font-black text-white">フラッシュカード</h3>
                                    </div>
                                    <svg className="text-neutral-600 group-hover:text-indigo-400 transition-colors" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                                </button>

                                {/* Writing Card */}
                                <button
                                    onClick={() => setSelectingModeFor('writing_test')}
                                    className="w-full bg-neutral-800/80 border-2 border-neutral-700/50 rounded-3xl p-5 flex items-center gap-5 hover:bg-neutral-700/80 hover:border-indigo-500/50 transition-all active:scale-[0.98] shadow-lg group"
                                >
                                    <span className="text-4xl bg-neutral-900/50 p-3 rounded-2xl group-hover:scale-110 transition-transform">📝</span>
                                    <div className="flex-1 text-left">
                                        <h3 className="text-xl font-black text-white">ライティング</h3>
                                    </div>
                                    <svg className="text-neutral-600 group-hover:text-indigo-400 transition-colors" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                                </button>

                                {/* Dictation Card */}
                                <button
                                    onClick={() => setSelectingModeFor('dictation')}
                                    className="w-full bg-neutral-800/80 border-2 border-neutral-700/50 rounded-3xl p-5 flex items-center gap-5 hover:bg-neutral-700/80 hover:border-indigo-500/50 transition-all active:scale-[0.98] shadow-lg group"
                                >
                                    <span className="text-4xl bg-neutral-900/50 p-3 rounded-2xl group-hover:scale-110 transition-transform">🎧</span>
                                    <div className="flex-1 text-left">
                                        <h3 className="text-xl font-black text-white">ディクテーション</h3>
                                    </div>
                                    <svg className="text-neutral-600 group-hover:text-indigo-400 transition-colors" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                                </button>
                            </div>

                            {deck.words.some(w => !w.example && (!w.otherExamples || w.otherExamples.length === 0)) && (
                                <button
                                    onClick={handleBulkGenerate}
                                    disabled={isBulkGenerating}
                                    className="px-6 py-4 bg-amber-500 text-white text-base font-bold rounded-3xl shadow-lg hover:bg-amber-600 transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 mt-4 w-full max-w-xl mx-auto"
                                >
                                    <span className="text-2xl">{isBulkGenerating ? "⏳" : "🪄"}</span>
                                    {isBulkGenerating ? "生成中..." : "例文を一括生成"}
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {/* Word List */}
                <div className="flex-1 bg-neutral-900 md:bg-[#131313] rounded-none md:rounded-[2rem] border-y border-x-0 md:border-none border-neutral-800 overflow-hidden -mx-6 md:mx-0 md:mb-8 transition-colors">
                    {/* Encouragement Message */}
                    <div className="bg-indigo-900/20 px-6 py-2 text-center border-b border-indigo-800">
                        <p className="text-xs font-bold text-indigo-300">💡 覚えた単語には <span className="inline-flex items-center justify-center w-4 h-4 bg-green-500 text-white rounded-full text-[8px] mx-1">✓</span> を付けよう！<br />テストに出なくなります。</p>
                    </div>

                    <div className="p-3 sm:p-6 border-b border-neutral-800 bg-neutral-900/50 flex items-center justify-between gap-2 sm:gap-4 flex-wrap">
                        <div className="flex items-center gap-2 sm:gap-4 flex-1 min-w-0">
                            {!isSelectionMode ? (
                                <button
                                    onClick={() => setIsSelectionMode(true)}
                                    className="px-4 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-sm font-bold text-neutral-300 hover:bg-neutral-700 transition"
                                >
                                    選択する
                                </button>
                            ) : (
                                <div className="flex flex-wrap items-center gap-y-2 gap-x-2 sm:gap-x-4 animate-in fade-in slide-in-from-left-2 flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="checkbox"
                                            checked={sortedWords.length > 0 && sortedWords.every(w => w.id && selectedWordIds.has(w.id))}
                                            onChange={handleSelectAll}
                                            className="w-5 h-5 rounded border-neutral-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                        />
                                        <span className="text-sm font-bold text-neutral-400 whitespace-nowrap">
                                            {selectedWordIds.size}<span className="hidden xs:inline"> 選択中</span>
                                        </span>
                                    </div>

                                    <div className="flex items-center gap-1.5 sm:gap-2">
                                        {selectedWordIds.size > 0 && (
                                            <>
                                                <button onClick={handleBulkDelete} className="px-2 sm:px-3 py-1.5 bg-red-900/30 text-red-400 border border-red-800 rounded-lg text-[10px] sm:text-xs font-bold shadow-sm hover:bg-red-900/50 transition-colors flex items-center gap-1 whitespace-nowrap">
                                                    <span>🗑️</span> <span className="hidden xs:inline">一括</span>削除
                                                </button>
                                                <button onClick={() => setShowMoveModal(true)} className="px-2 sm:px-3 py-1.5 bg-indigo-900/30 text-indigo-400 border border-indigo-800 rounded-lg text-[10px] sm:text-xs font-bold shadow-sm hover:bg-indigo-900/50 transition-colors flex items-center gap-1 whitespace-nowrap">
                                                    <span>📤</span> 移動<span className="hidden xs:inline">/コピー</span>
                                                </button>
                                            </>
                                        )}

                                        <button
                                            onClick={() => {
                                                setIsSelectionMode(false);
                                                setSelectedWordIds(new Set());
                                            }}
                                            className="px-2 sm:px-3 py-1.5 bg-neutral-800 text-neutral-300 rounded-lg text-[10px] sm:text-xs font-bold hover:bg-neutral-700 transition whitespace-nowrap"
                                        >
                                            取消
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Sort Controls */}
                        <div className="flex items-center gap-1.5 sm:gap-2 text-sm shrink-0 ml-auto">
                            <span className="text-neutral-500 font-bold text-[10px] sm:text-xs uppercase hidden xxs:block">並べ替え:</span>
                            <select
                                value={sortKey}
                                onChange={(e) => setSortKey(e.target.value as any)}
                                className="bg-black border border-neutral-700 rounded-lg px-2 py-1 font-bold focus:outline-none text-white text-xs sm:text-sm"
                            >
                                <option value="created_asc">作成順</option>
                                <option value="created_desc">最新順</option>
                                <option value="pos">品詞順</option>
                            </select>
                        </div>
                    </div>

                    {
                        sortedWords.length === 0 ? (
                            <div className="p-12 text-center text-neutral-400">単語がありません。ホーム画面から追加してください。</div>
                        ) : (
                            sortedWords.map((card, idx) => (
                                <div
                                    key={card.id || idx}
                                    className="group p-6 border-b border-neutral-800 last:border-0 hover:bg-neutral-800/30 transition-colors flex gap-4 items-start relative select-none"
                                >
                                    {isSelectionMode && (
                                        <div className="pt-1.5 flex flex-col gap-2 items-center">
                                            <input
                                                type="checkbox"
                                                checked={card.id ? selectedWordIds.has(card.id) : false}
                                                onChange={() => card.id && toggleSelectWord(card.id)}
                                                className="w-5 h-5 rounded border-neutral-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                            />
                                        </div>
                                    )}

                                    {/* Mastered Checkbox */}
                                    {!isSelectionMode && (
                                        <button
                                            onClick={(e) => card.id && toggleMastered(card.id, !!card.isMastered, e)}
                                            className={`pt-1.5 transition-opacity ${card.isMastered ? 'opacity-100' : 'opacity-30 hover:opacity-100'}`}
                                            title={card.isMastered ? "マスター済み (学習対象から除外)" : "未マスター"}
                                        >
                                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${card.isMastered ? 'bg-green-500 border-green-500 text-white' : 'border-neutral-300'}`}>
                                                {card.isMastered && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>}
                                            </div>
                                        </button>
                                    )}

                                    {/* Editing Form */}
                                    {editingWordId === card.id ? (
                                        <div className="flex-1 space-y-4">
                                            <div className="grid grid-cols-1 gap-4">
                                                <div>
                                                    <label className="block text-xs font-bold text-neutral-400 uppercase mb-1">単語</label>
                                                    <input
                                                        value={editFormData.word}
                                                        onChange={(e) => setEditFormData({ ...editFormData, word: e.target.value })}
                                                        className="w-full p-2 border border-neutral-700 rounded bg-black text-white font-serif font-bold"
                                                    />
                                                </div>

                                                {/* POS Field Removed */}
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-neutral-400 uppercase mb-1">意味</label>
                                                <textarea
                                                    value={editFormData.meaning}
                                                    onChange={(e) => setEditFormData({ ...editFormData, meaning: e.target.value })}
                                                    rows={3}
                                                    className="w-full p-2 border border-neutral-700 rounded bg-black text-white font-bold text-sm"
                                                ></textarea>
                                            </div>
                                            {/* Primary Example fields removed for modernization */}

                                            {/* 追加の例文の編集セクション */}
                                            <div className="space-y-4 pt-4 border-t border-neutral-800">
                                                <div className="flex items-center justify-between">
                                                    <label className="block text-xs font-bold text-neutral-400 uppercase">追加の例文</label>
                                                    <button
                                                        onClick={() => {
                                                            const newExamples = [...editFormData.otherExamples, { role: "", text: "", translation: "" }];
                                                            setEditFormData({ ...editFormData, otherExamples: newExamples });
                                                        }}
                                                        className="px-3 py-1 bg-neutral-800 text-indigo-400 rounded-lg text-xs font-bold hover:bg-neutral-700 transition"
                                                    >
                                                        + 例文を追加
                                                    </button>
                                                </div>

                                                {editFormData.otherExamples.map((ex, i) => (
                                                    <div key={i} className="p-4 bg-neutral-800/50 rounded-xl space-y-3 relative group/ex">
                                                        <button
                                                            onClick={() => {
                                                                const newExamples = editFormData.otherExamples.filter((_, idx) => idx !== i);
                                                                setEditFormData({ ...editFormData, otherExamples: newExamples });
                                                            }}
                                                            className="absolute top-2 right-2 text-neutral-400 hover:text-red-500 transition-colors"
                                                        >
                                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                                        </button>
                                                        <div>
                                                            <label className="block text-[10px] font-bold text-neutral-400 uppercase mb-1">役割（例：動詞、熟語）</label>
                                                            <input
                                                                value={ex.role}
                                                                placeholder="例: 動詞"
                                                                onChange={(e) => {
                                                                    const newExamples = [...editFormData.otherExamples];
                                                                    newExamples[i].role = e.target.value;
                                                                    setEditFormData({ ...editFormData, otherExamples: newExamples });
                                                                }}
                                                                className="w-full p-1.5 text-xs border border-neutral-700 rounded bg-black font-bold"
                                                            />
                                                        </div>
                                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                            <div>
                                                                <label className="block text-[10px] font-bold text-neutral-400 uppercase mb-1">英文</label>
                                                                <textarea
                                                                    value={ex.text}
                                                                    onChange={(e) => {
                                                                        const newExamples = [...editFormData.otherExamples];
                                                                        newExamples[i].text = e.target.value;
                                                                        setEditFormData({ ...editFormData, otherExamples: newExamples });
                                                                    }}
                                                                    rows={2}
                                                                    className="w-full p-1.5 text-xs border border-neutral-700 rounded bg-black"
                                                                ></textarea>
                                                            </div>
                                                            <div>
                                                                <label className="block text-[10px] font-bold text-neutral-400 uppercase mb-1">和訳</label>
                                                                <textarea
                                                                    value={ex.translation}
                                                                    onChange={(e) => {
                                                                        const newExamples = [...editFormData.otherExamples];
                                                                        newExamples[i].translation = e.target.value;
                                                                        setEditFormData({ ...editFormData, otherExamples: newExamples });
                                                                    }}
                                                                    rows={2}
                                                                    className="w-full p-1.5 text-xs border border-neutral-700 rounded bg-black"
                                                                ></textarea>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>

                                            {/* Synonyms Edit */}
                                            <div className="pt-4 border-t border-neutral-800">
                                                <label className="block text-xs font-bold text-neutral-400 uppercase mb-2">類義語 (Synonyms)</label>
                                                {editFormData.synonyms.map((s, i) => (
                                                    <div key={i} className="flex gap-2 mb-2 items-center">
                                                        <input value={s.word} onChange={e => {
                                                            const n = [...editFormData.synonyms]; n[i].word = e.target.value; setEditFormData({ ...editFormData, synonyms: n });
                                                        }} className="w-1/3 p-1 text-xs border rounded bg-black" placeholder="Word" />
                                                        <input value={s.partOfSpeech} onChange={e => {
                                                            const n = [...editFormData.synonyms]; n[i].partOfSpeech = e.target.value; setEditFormData({ ...editFormData, synonyms: n });
                                                        }} className="w-1/4 p-1 text-xs border rounded bg-black" placeholder="POS" />
                                                        <input value={s.meaning} onChange={e => {
                                                            const n = [...editFormData.synonyms]; n[i].meaning = e.target.value; setEditFormData({ ...editFormData, synonyms: n });
                                                        }} className="flex-1 p-1 text-xs border rounded bg-black" placeholder="Meaning" />
                                                        <button onClick={() => {
                                                            const n = editFormData.synonyms.filter((_, idx) => idx !== i); setEditFormData({ ...editFormData, synonyms: n });
                                                        }} className="text-red-400 hover:text-red-600">×</button>
                                                    </div>
                                                ))}
                                                <button onClick={() => setEditFormData({ ...editFormData, synonyms: [...editFormData.synonyms, { word: "", partOfSpeech: "", meaning: "" }] })} className="text-xs text-indigo-500 font-bold">+ 追加</button>
                                            </div>

                                            {/* Derivatives Edit */}
                                            <div className="pt-4 border-t border-neutral-800">
                                                <label className="block text-xs font-bold text-neutral-400 uppercase mb-2">派生語 (Derivatives)</label>
                                                {editFormData.derivatives.map((d, i) => (
                                                    <div key={i} className="flex gap-2 mb-2 items-center">
                                                        <input value={d.word} onChange={e => {
                                                            const n = [...editFormData.derivatives]; n[i].word = e.target.value; setEditFormData({ ...editFormData, derivatives: n });
                                                        }} className="w-1/3 p-1 text-xs border rounded bg-black" placeholder="Word" />
                                                        <input value={d.partOfSpeech} onChange={e => {
                                                            const n = [...editFormData.derivatives]; n[i].partOfSpeech = e.target.value; setEditFormData({ ...editFormData, derivatives: n });
                                                        }} className="w-1/4 p-1 text-xs border rounded bg-black" placeholder="POS" />
                                                        <input value={d.meaning} onChange={e => {
                                                            const n = [...editFormData.derivatives]; n[i].meaning = e.target.value; setEditFormData({ ...editFormData, derivatives: n });
                                                        }} className="flex-1 p-1 text-xs border rounded bg-black" placeholder="Meaning" />
                                                        <button onClick={() => {
                                                            const n = editFormData.derivatives.filter((_, idx) => idx !== i); setEditFormData({ ...editFormData, derivatives: n });
                                                        }} className="text-red-400 hover:text-red-600">×</button>
                                                    </div>
                                                ))}
                                                <button onClick={() => setEditFormData({ ...editFormData, derivatives: [...editFormData.derivatives, { word: "", partOfSpeech: "", meaning: "" }] })} className="text-xs text-indigo-500 font-bold">+ 追加</button>
                                            </div>
                                            <div className="flex justify-end gap-2 mt-2">
                                                <button onClick={handleCancelEdit} className="px-4 py-2 bg-neutral-800 rounded font-bold text-sm">キャンセル</button>
                                                <button onClick={handleSaveEdit} className="px-4 py-2 bg-indigo-600 text-white rounded font-bold text-sm">保存</button>
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="flex-1 flex flex-col sm:flex-row gap-4 sm:items-baseline pr-12">
                                                <div className="flex flex-wrap items-baseline gap-2 sm:gap-3 min-w-[120px] sm:min-w-[200px]">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xl sm:text-2xl font-black font-serif tracking-tight" style={{ fontFamily: 'var(--font-merriweather)' }}>{card.word}</span>
                                                        <button
                                                            onClick={() => speak(card.word)}
                                                            className="p-1.5 text-neutral-300 hover:text-indigo-500 rounded-full hover:bg-neutral-800 transition-colors shrink-0"
                                                            title="Play word"
                                                        >
                                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
                                                        </button>
                                                    </div>
                                                    {/* POS Badge Removed */}
                                                </div>
                                                <div className="flex-1 pt-1">
                                                    <div className="text-sm sm:text-base font-bold text-neutral-200 mb-2 leading-relaxed whitespace-pre-wrap break-words" style={{ fontFamily: 'var(--font-noto-serif-jp)' }}>{formatMeaningText(card.meaning)}</div>
                                                    <div className="space-y-1">
                                                        {/* 例文セクション (ロック機能なし) */}
                                                        {(card.example || (card.otherExamples && card.otherExamples.length > 0)) ? (
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
                                                                        {/* Legacy primary example display removed for modernization */}

                                                                        {/* 追加の例文表示 (リスト表示) */}
                                                                        {card.otherExamples && card.otherExamples.length > 0 && (
                                                                            <>
                                                                                <div className="mb-4 flex justify-end">
                                                                                    <button
                                                                                        onClick={() => card.id && handleGenerateDetails(card.id, true)}
                                                                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-900/40 text-indigo-400 rounded-full text-[10px] font-bold hover:bg-indigo-900/60 transition-colors border border-indigo-800"
                                                                                    >
                                                                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3" /></svg>
                                                                                        再生成 (🪙1)
                                                                                    </button>
                                                                                </div>
                                                                                <div className="mt-4 space-y-6">
                                                                                    {card.otherExamples.filter((ex: any) => ex && typeof ex.text === 'string' && ex.text.trim() !== "").map((ex: any, i) => (
                                                                                        <div key={i} className="relative pl-4 border-l-2 border-indigo-600 animate-in fade-in slide-in-from-left-2 duration-300" style={{ animationDelay: `${i * 100}ms` }}>
                                                                                            {ex.role && (
                                                                                                <div className="mb-2">
                                                                                                    <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 bg-indigo-950/40 text-indigo-400 rounded-md border border-indigo-900/50">
                                                                                                        {ex.role}
                                                                                                    </span>
                                                                                                </div>
                                                                                            )}

                                                                                            <div className="flex items-start gap-4">
                                                                                                <button
                                                                                                    onClick={() => speak(ex.text)}
                                                                                                    className="mt-1 flex items-center justify-center w-10 h-10 bg-neutral-800 border border-neutral-700 text-indigo-500 rounded-full hover:bg-indigo-900/30 hover:scale-110 active:scale-95 transition-all shadow-sm shrink-0"
                                                                                                    title="Listen to example"
                                                                                                >
                                                                                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
                                                                                                </button>
                                                                                                <div className="flex-1 min-w-0">
                                                                                                    <div className="text-base sm:text-lg text-neutral-100 font-serif leading-tight mb-1">
                                                                                                        {ex.text}
                                                                                                    </div>
                                                                                                    <div className="text-sm text-neutral-400 font-light leading-snug" style={{ fontFamily: 'var(--font-noto-serif-jp)' }}>
                                                                                                        {ex.translation}
                                                                                                    </div>
                                                                                                </div>
                                                                                            </div>
                                                                                        </div>
                                                                                    ))}
                                                                                </div>
                                                                            </>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        ) : (
                                                            <button
                                                                onClick={() => card.id && handleGenerateDetails(card.id)}
                                                                className="mt-2 text-xs font-bold text-amber-500 hover:text-amber-600 flex items-center gap-1 px-3 py-1.5 bg-amber-900/10 rounded-full w-fit"
                                                            >
                                                                <span>🪄</span> 例文を生成
                                                            </button>
                                                        )}

                                                        {/* Synonyms & Derivatives Section */}
                                                        {expandedListItems[card.id!] && (
                                                            <div className="mt-8 pt-6 border-t border-neutral-800 animate-in fade-in slide-in-from-top-2">

                                                                {/* Generate Button if missing or empty */}
                                                                {(!card.synonyms || card.synonyms.length === 0) && (!card.derivatives || card.derivatives.length === 0) ? (
                                                                    <div className="pb-4">
                                                                        <button
                                                                            onClick={() => card.id && handleGenerateExtras(card.id, 'all', false)}
                                                                            className="w-full py-3 bg-gradient-to-r from-indigo-900/10 to-purple-900/10 text-indigo-400 font-bold text-xs rounded-xl hover:from-indigo-900/20 hover:to-purple-900/20 transition-all flex items-center justify-center gap-2 border border-indigo-800/30 shadow-sm"
                                                                        >
                                                                            <span>✨</span> 類義語・派生語を生成 (1コイン)
                                                                        </button>
                                                                    </div>
                                                                ) : (
                                                                    <>
                                                                        <div className="flex justify-end mb-4">
                                                                            <button
                                                                                onClick={() => card.id && handleGenerateExtras(card.id, 'all', true)}
                                                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-800 text-neutral-400 rounded-full text-[10px] font-bold hover:bg-neutral-700 transition-colors border border-neutral-700"
                                                                            >
                                                                                <span>↻</span> 類義語・派生語を再生成 (🪙1)
                                                                            </button>
                                                                        </div>

                                                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                                                            {/* Synonyms */}
                                                                            <div>
                                                                                <div className="flex items-center justify-between mb-3">
                                                                                    <h4 className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">類義語 (Synonyms)</h4>
                                                                                </div>

                                                                                {!card.synonyms || card.synonyms.length === 0 ? (
                                                                                    <p className="text-xs text-neutral-400 italic">なし</p>
                                                                                ) : (
                                                                                    <ul className="space-y-2">
                                                                                        {card.synonyms.map((s, i) => {
                                                                                            const formatPOS = (pos: string) => {
                                                                                                const lower = pos.toLowerCase();
                                                                                                if (lower.startsWith('verb')) return '動';
                                                                                                if (lower.startsWith('noun')) return '名';
                                                                                                if (lower.startsWith('adj')) return '形';
                                                                                                if (lower.startsWith('adv')) return '副';
                                                                                                if (lower.startsWith('phr') || lower.startsWith('idiom')) return '熟';
                                                                                                return pos;
                                                                                            };
                                                                                            return (
                                                                                                <li key={i} className="text-sm bg-black/20 p-2 rounded-lg border border-neutral-800">
                                                                                                    <div className="font-bold text-indigo-400">{s.word}</div>
                                                                                                    <div className="text-xs text-neutral-400 flex items-start gap-2">
                                                                                                        <span className="shrink-0 bg-neutral-800 text-neutral-300 px-1.5 rounded text-[10px]">{formatPOS(s.partOfSpeech)}</span>
                                                                                                        <span>{s.meaning}</span>
                                                                                                    </div>
                                                                                                </li>
                                                                                            );
                                                                                        })}
                                                                                    </ul>
                                                                                )}
                                                                            </div>

                                                                            {/* Derivatives */}
                                                                            <div>
                                                                                <h4 className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-3">派生語 (Derivatives)</h4>

                                                                                {!card.derivatives || card.derivatives.length === 0 ? (
                                                                                    <p className="text-xs text-neutral-400 italic">なし</p>
                                                                                ) : (
                                                                                    <ul className="space-y-2">
                                                                                        {card.derivatives.map((d, i) => {
                                                                                            const formatPOS = (pos: string) => {
                                                                                                const lower = pos.toLowerCase();
                                                                                                if (lower.startsWith('verb')) return '動';
                                                                                                if (lower.startsWith('noun')) return '名';
                                                                                                if (lower.startsWith('adj')) return '形';
                                                                                                if (lower.startsWith('adv')) return '副';
                                                                                                if (lower.startsWith('phr') || lower.startsWith('idiom')) return '熟';
                                                                                                return pos;
                                                                                            };
                                                                                            return (
                                                                                                <li key={i} className="text-sm bg-black/20 p-2 rounded-lg border border-neutral-800">
                                                                                                    <div className="font-bold text-purple-400">{d.word}</div>
                                                                                                    <div className="text-xs text-neutral-400 flex items-start gap-2">
                                                                                                        <span className="shrink-0 bg-neutral-800 text-neutral-300 px-1.5 rounded text-[10px]">{formatPOS(d.partOfSpeech)}</span>
                                                                                                        <span>{d.meaning}</span>
                                                                                                    </div>
                                                                                                </li>
                                                                                            );
                                                                                        })}
                                                                                    </ul>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    </>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Action Buttons */}
                                            <div className="absolute top-4 right-4 flex gap-2 opacity-100 transition-opacity">
                                                {/* Edit Button */}
                                                <button
                                                    onClick={() => handleStartEdit(card)}
                                                    className="text-neutral-300 hover:text-indigo-500 bg-black/80 sm:bg-transparent rounded-full p-1.5"
                                                    title="Edit word"
                                                >
                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                                                </button>
                                                {/* Delete Button */}
                                                <button
                                                    onClick={() => handleDeleteWord(card.id)}
                                                    className="text-neutral-300 hover:text-red-500 bg-black/80 sm:bg-transparent rounded-full p-1.5"
                                                    title="Remove word"
                                                >
                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg>
                                                </button>
                                            </div>
                                        </>
                                    )}
                                </div>
                            ))
                        )
                    }
                </div >
            </main >

            {/* Move/Copy Modal */}
            {
                showMoveModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
                        <div className="bg-neutral-900 w-full max-w-sm rounded-[2rem] p-8 shadow-2xl border border-neutral-800 scale-100 flex flex-col gap-6">
                            <div>
                                <h3 className="text-2xl font-black mb-2 flex items-center gap-2">
                                    <span>📤</span> 移動 / コピー
                                </h3>
                                <p className="text-neutral-500 text-sm">
                                    選択した <span className="font-bold text-white">{selectedWordIds.size}</span> 件の単語を操作します。
                                </p>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-neutral-400 uppercase mb-2">移動先の単語帳</label>
                                    <select
                                        value={targetDeckId}
                                        onChange={(e) => setTargetDeckId(e.target.value)}
                                        className="w-full p-4 rounded-xl bg-neutral-800 border-none font-bold text-neutral-200 focus:ring-2 focus:ring-indigo-500"
                                    >
                                        <option value="">選択してください...</option>
                                        {myDecks.map(d => (
                                            <option key={d.id} value={d.id}>{d.title}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="flex flex-col gap-3 pt-2">
                                    <button
                                        disabled={!targetDeckId}
                                        onClick={() => handleMoveWords('move')}
                                        className="w-full py-4 bg-indigo-600 text-white rounded-xl font-bold shadow-lg shadow-indigo-500/20 hover:bg-indigo-700 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2"
                                    >
                                        <span>➡️ 単語を移動する</span>
                                    </button>

                                    <button
                                        disabled={!targetDeckId}
                                        onClick={() => handleMoveWords('copy')}
                                        className="w-full py-4 bg-neutral-800 text-white border-2 border-neutral-700 rounded-xl font-bold hover:bg-neutral-700 transition-all active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2"
                                    >
                                        <span>📋 コピーする</span>
                                        <span className="text-xs font-normal px-2 py-0.5 bg-yellow-900/30 text-yellow-400 rounded-full border border-yellow-800">
                                            🪙 -{selectedWordIds.size}
                                        </span>
                                    </button>
                                </div>
                            </div>

                            <button
                                onClick={() => setShowMoveModal(false)}
                                className="mt-2 text-neutral-400 font-bold text-sm hover:text-neutral-200 transition-colors"
                            >
                                キャンセル
                            </button>
                        </div>
                    </div>
                )
            }

            {/* Mode Selection Modal */}
            {
                selectingModeFor && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                        <div className="bg-neutral-900 w-full max-w-sm rounded-[2rem] p-8 shadow-2xl border border-neutral-800 flex flex-col gap-6">
                            <div className="text-center">
                                <h3 className="text-2xl font-black mb-2 text-white">
                                    {selectingModeFor === 'dictation' ? 'Dictation Mode' : 'Writing Mode'}
                                </h3>
                                <p className="text-neutral-400 text-sm">出題形式を選んでください</p>
                            </div>

                            <div className="space-y-3">
                                {/* Word Only */}
                                <button
                                    onClick={() => {
                                        handleRestart(false, 'word');
                                        setMode(selectingModeFor);
                                        setSelectingModeFor(null);
                                    }}
                                    className="w-full p-4 rounded-xl border-2 border-neutral-700 hover:border-indigo-500 bg-neutral-800/50 hover:bg-neutral-800 transition-all group text-left relative overflow-hidden"
                                >
                                    <div className="relative z-10">
                                        <div className="font-bold text-lg text-white mb-1">単語のみ</div>
                                        <div className="text-xs text-neutral-400">
                                            {selectingModeFor === 'dictation'
                                                ? "音声を聞いて単語を書き取る基本モード"
                                                : "意味を見て単語を入力する基本モード"}
                                        </div>
                                    </div>
                                    <div className="absolute right-4 top-1/2 -translate-y-1/2 text-4xl opacity-10 group-hover:opacity-20 transition-opacity">
                                        🍎
                                    </div>
                                </button>

                                {/* Fill-in */}
                                <button
                                    onClick={() => {
                                        handleRestart(false, 'fill-in');
                                        setMode(selectingModeFor);
                                        setSelectingModeFor(null);
                                    }}
                                    className="w-full p-4 rounded-xl border-2 border-indigo-500/50 hover:border-indigo-400 bg-indigo-900/10 hover:bg-indigo-900/20 transition-all group text-left relative overflow-hidden"
                                >
                                    <div className="relative z-10">
                                        <div className="font-bold text-lg text-indigo-300 mb-1">例文穴埋め</div>
                                        <div className="text-xs text-indigo-200/60">
                                            {selectingModeFor === 'dictation'
                                                ? "例文を聞いて空欄の単語を書き取る"
                                                : "日本語訳を見て空欄の単語を埋める"}
                                        </div>
                                    </div>
                                    <div className="absolute right-4 top-1/2 -translate-y-1/2 text-4xl opacity-10 group-hover:opacity-20 transition-opacity">
                                        🧩
                                    </div>
                                </button>

                                {/* Full Sentence */}
                                <button
                                    onClick={() => {
                                        handleRestart(false, 'full');
                                        setMode(selectingModeFor);
                                        setSelectingModeFor(null);
                                    }}
                                    className="w-full p-4 rounded-xl border-2 border-amber-500/50 hover:border-amber-400 bg-amber-900/10 hover:bg-amber-900/20 transition-all group text-left relative overflow-hidden"
                                >
                                    <div className="relative z-10">
                                        <div className="flex items-center gap-2 mb-1">
                                            <div className="font-bold text-lg text-amber-500">例文全文</div>
                                            <span className="text-[10px] font-black bg-amber-500 text-black px-1.5 py-0.5 rounded">HARD</span>
                                        </div>
                                        <div className="text-xs text-amber-200/60">
                                            {selectingModeFor === 'dictation'
                                                ? "読み上げられた例文をすべて書き取る"
                                                : "日本語訳を見て英文をすべて書く"}
                                        </div>
                                    </div>
                                    <div className="absolute right-4 top-1/2 -translate-y-1/2 text-4xl opacity-10 group-hover:opacity-20 transition-opacity">
                                        🔥
                                    </div>
                                </button>
                            </div>

                            <button
                                onClick={() => setSelectingModeFor(null)}
                                className="mt-2 text-neutral-500 hover:text-white font-bold text-sm transition-colors py-2"
                            >
                                キャンセル
                            </button>
                        </div>
                    </div>
                )
            }
        </div >
    );
}
