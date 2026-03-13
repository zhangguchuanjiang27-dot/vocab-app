"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useState, useEffect } from "react";

export default function BottomNav() {
    const pathname = usePathname();
    const { data: session } = useSession();

    const [currentHash, setCurrentHash] = useState("");

    useEffect(() => {
        const updateHash = () => setCurrentHash(window.location.hash);
        updateHash(); // Initial check and sync on path change

        window.addEventListener("hashchange", updateHash);
        window.addEventListener("open-saved-decks", () => setCurrentHash("#saved"));
        window.addEventListener("close-saved-decks", () => setCurrentHash(""));

        return () => {
            window.removeEventListener("hashchange", updateHash);
            window.removeEventListener("open-saved-decks", () => setCurrentHash("#saved"));
            window.removeEventListener("close-saved-decks", () => setCurrentHash(""));
        };
    }, [pathname]);

    if (!session) {
        return null;
    }

    const navItems = [
        {
            label: "ホーム",
            href: "/",
            icon: (
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
                </svg>
            )
        },
        {
            label: "単語帳",
            href: "/#saved",
            icon: (
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                </svg>
            )
        },
        {
            label: "ランキング",
            href: "/ranking",
            icon: (
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
                </svg>
            )
        },
        {
            label: "プロフィール",
            href: "/profile",
            icon: (
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                </svg>
            )
        }
    ];

    return (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-black/95 backdrop-blur-md border-t border-neutral-800 pb-[env(safe-area-inset-bottom)]">
            <div className="flex items-center justify-around h-[60px]">
                {navItems.map((item) => {
                    const isHome = item.href === "/";
                    const isSavedTab = item.href === "/#saved";

                    let isActive = false;
                    if (isSavedTab) {
                        isActive = currentHash === "#saved" && pathname === "/";
                    } else if (isHome) {
                        isActive = pathname === "/" && currentHash !== "#saved";
                    } else {
                        isActive = pathname === item.href;
                    }

                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            onClick={() => {
                                if (item.href === "/#saved") {
                                    window.dispatchEvent(new Event("open-saved-decks"));
                                } else if (item.href === "/") {
                                    window.dispatchEvent(new Event("close-saved-decks"));
                                }
                            }}
                            className={`flex flex-col items-center justify-center w-full h-full gap-1 transition-colors ${isActive ? 'text-indigo-400' : 'text-neutral-500 hover:text-neutral-300'
                                }`}
                        >
                            <div className={isActive ? "scale-110 transition-transform" : "scale-100 transition-transform"}>
                                {item.icon}
                            </div>
                            <span className="text-[10px] font-bold">{item.label}</span>
                        </Link>
                    );
                })}
            </div>
        </div>
    );
}
