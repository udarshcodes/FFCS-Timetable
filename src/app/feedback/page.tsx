"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

export default function FeedbackPage() {
    const [feedback, setFeedback] = useState("");
    const [category, setCategory] = useState<"bug" | "feature" | "general">("general");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [message, setMessage] = useState("");
    const router = useRouter();
    const { data: session } = useSession();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!feedback.trim()) return;

        setIsSubmitting(true);
        try {
            const submissionText = `[${category.toUpperCase()}] ${feedback}`;

            const res = await fetch("/api/feedback", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    feedback: submissionText,
                    userName: session?.user?.name,
                    email: session?.user?.email
                }),
            });

            if (res.ok) {
                setMessage("Thank you! Your feedback has been received.");
                setFeedback("");
                const timeoutId = setTimeout(() => {
  router.push("/");
}, 2000);
clearTimeout(timeoutId);
            } else {
                setMessage("Failed to submit feedback. Please try again.");
            }
        } catch {
            setMessage("An error occurred. Please try again.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen bg-cream flex items-center justify-center p-4 md:p-12">
            <div className="w-full max-w-5xl bg-white rounded-[32px] shadow-[0_24px_60px_rgba(74,54,30,0.06)] border border-[#fdf6e2] overflow-hidden flex flex-col md:flex-row min-h-[560px] animate-lucid-fade-up">
                
                {/* Left Visual Column */}
                <div className="w-full md:w-[38%] bg-gradient-to-br from-[#1e293b] via-[#0f172a] to-[#020617] p-8 md:p-12 text-white flex flex-col justify-between relative overflow-hidden shrink-0">
                    {/* Background glows */}
                    <div className="absolute top-[-20%] right-[-20%] w-60 h-60 rounded-full bg-[#A0C4FF]/10 blur-[80px]" />
                    <div className="absolute bottom-[-20%] left-[-20%] w-60 h-60 rounded-full bg-[#CAFFD0]/10 blur-[80px]" />

                    <div className="flex flex-col gap-8 z-10">
                        <span className="text-[13px] font-black tracking-widest text-[#A0C4FF] uppercase">FFCS PLANNER</span>
                        <div className="flex flex-col gap-4">
                            <h2 className="text-3xl md:text-4xl font-black leading-tight tracking-tight">Help us build<br />something better.</h2>
                            <p className="text-slate-400 font-medium text-[14px] leading-relaxed">
                                Your thoughts, bug reports, and suggestions help us polish the FFCS timetable planner. We read every submission.
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-col gap-2 mt-12 md:mt-0 z-10">
                        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">CREATIVE STUDIO</span>
                        <p className="text-[13px] text-slate-300 font-bold flex items-center gap-1.5">
                            Built with ❤️ by MIC Chennai
                        </p>
                    </div>
                </div>

                {/* Right Form Column */}
                <div className="flex-1 p-8 md:p-12 flex flex-col justify-center bg-white relative">
                    {/* Close Button */}
                    <button
                        onClick={() => router.push("/")}
                        className="absolute right-6 top-6 w-10 h-10 flex items-center justify-center rounded-full bg-gray-50 hover:bg-gray-100 border border-gray-100 text-gray-500 hover:text-black transition-colors cursor-pointer z-10"
                        title="Go back"
                    >
                        ✕
                    </button>

                    <div className="flex flex-col gap-6">
                        <div className="flex flex-col gap-1.5">
                            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Share feedback</span>
                            <h1 className="text-3xl font-black text-black leading-tight">Give Feedback</h1>
                        </div>

                        <div className="w-full h-px bg-gray-100" />

                        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
                            {/* Category selection */}
                            <div className="flex flex-col gap-2">
                                <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Category</span>
                                <div className="flex flex-wrap gap-2.5">
                                    {[
                                        { id: "bug", label: "🐛 Bug Report", bgActive: "bg-red-50 border-red-200 text-red-600" },
                                        { id: "feature", label: "💡 Feature Request", bgActive: "bg-purple-50 border-purple-200 text-purple-600" },
                                        { id: "general", label: "💬 General Feedback", bgActive: "bg-blue-50 border-blue-200 text-blue-600" }
                                    ].map((cat) => {
                                        const isActive = category === cat.id;
                                        return (
                                            <button
                                                key={cat.id}
                                                type="button"
                                                onClick={() => setCategory(cat.id as "bug" | "feature" | "general")}
                                                className={`px-4 py-2.5 rounded-2xl border-2 text-[13px] font-black transition-all cursor-pointer ${
                                                    isActive
                                                        ? `${cat.bgActive} scale-102 shadow-sm`
                                                        : "bg-gray-50/50 border-gray-100/80 text-gray-600 hover:bg-gray-50 hover:border-gray-200"
                                                }`}
                                            >
                                                {cat.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Textarea */}
                            <div className="flex flex-col gap-2">
                                <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Message</span>
                                <textarea
                                    value={feedback}
                                    onChange={(e) => setFeedback(e.target.value)}
                                    placeholder="Describe your issue or suggestion..."
                                    className="w-full h-40 p-4 rounded-2xl border-2 border-gray-100 bg-gray-50/50 focus:bg-white focus:border-[#A0C4FF] focus:outline-none transition-all resize-none text-black text-[14px] font-medium placeholder-gray-400 shadow-inner"
                                    required
                                />
                            </div>

                            {message && (
                                <div className={`p-4 rounded-2xl font-bold text-[14px] text-center border ${
                                    message.includes("Thank you") 
                                        ? "bg-[#d1fae5] text-green-900 border-[#a7f3d0]" 
                                        : "bg-red-50 text-red-800 border-red-200"
                                }`}>
                                    {message}
                                </div>
                            )}

                            {/* Submit Button */}
                            <div className="flex justify-end pt-2">
                                <button
                                    type="submit"
                                    disabled={isSubmitting || !feedback.trim()}
                                    className="w-full sm:w-auto py-3.5 px-8 bg-[#A0C4FF] hover:bg-[#8ab2f2] text-black font-black rounded-2xl shadow-[0_8px_30px_rgba(160,196,255,0.25)] hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer text-[14px] border-none disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isSubmitting ? "Submitting..." : "Submit Feedback"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
}
