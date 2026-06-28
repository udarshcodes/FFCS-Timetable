'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';

interface Section {
  id: string;
  title: string;
}

const SECTIONS: Section[] = [
  { id: 'acceptance', title: '1. Acceptance of Terms' },
  { id: 'eligibility', title: '2. Eligibility & Accounts' },
  { id: 'purpose-use', title: '3. Purpose & Use of the Planner' },
  { id: 'intellectual-property', title: '4. Intellectual Property' },
  { id: 'conduct', title: '5. Prohibited Conduct' },
  { id: 'warranties', title: '6. Disclaimer of Warranties' },
  { id: 'liability', title: '7. Limitation of Liability' },
  { id: 'changes', title: '8. Changes to Terms' },
  { id: 'contact', title: '9. Contact Us' },
];

export default function TermsOfService() {
  const [activeSection, setActiveSection] = useState<string>('acceptance');

  useEffect(() => {
    const visibleSections: Record<string, boolean> = {};

import { observerCallback } from '../utils/intersectionObserverUtils';

// Utility functions moved to a separate utility file
import { updateVisibleSections, findFirstVisibleSection } from '../utils/intersectionObserverUtils';

    const observer = new IntersectionObserver(observerCallback, {
      root: null,
      rootMargin: '-15% 0px -75% 0px',
      threshold: 0.05,
    });

    SECTIONS.forEach((section) => {
      const element = document.getElementById(section.id);
      if (element) observer.observe(element);
    });

    return () => {
      SECTIONS.forEach((section) => {
        const element = document.getElementById(section.id);
        if (element) observer.unobserve(element);
      });
    };
  }, []);

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      const yOffset = -90; // Adjust header offset
      const y = element.getBoundingClientRect().top + window.scrollY + yOffset;
      window.scrollTo({ top: y, behavior: 'smooth' });
      setActiveSection(id);
    }
  };

  return (
    <div className="min-h-screen bg-[#FFF8E7] text-[#171717] font-body transition-colors duration-300">
      {/* Decorative Top Bar */}
      <div className="w-full h-2 bg-gradient-to-r from-[#A0C4FF] via-[#BFA5EE] to-[#B8EDC0] sticky top-0 z-50" />

      {/* Header Container */}
      <header className="sticky top-2 z-40 w-full px-4 sm:px-6 lg:px-8 py-4">
        <div className="w-full bg-white/70 backdrop-blur-md border border-[#eadcc5]/80 rounded-2xl px-6 py-4 shadow-sm flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 active:scale-95 transition-all">
            <Image src="/mic-logo.png" alt="MIC Logo" width={36} height={36} className="rounded-lg shadow-sm" />
            <div className="flex flex-col">
              <span className="font-heading font-black text-lg sm:text-xl tracking-wider text-[#171717]">
                FFCS PLANNER
              </span>
              <span className="text-[10px] uppercase font-bold text-gray-400 tracking-widest">
                by MIC VIT Chennai
              </span>
            </div>
          </Link>

          <Link
            href="/"
            className="flex items-center gap-2 px-4 py-2 bg-[#3B5BDB] hover:bg-[#2B43A6] text-white rounded-xl text-sm font-bold shadow-sm hover:shadow transition-all active:scale-95 duration-150"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              viewBox="0 0 24 24"
            >
              <path d="m15 18-6-6 6-6" />
            </svg>
            <span>Back to Home</span>
          </Link>
        </div>
      </header>

      {/* Main Layout */}
      <div className="w-full px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="w-full">
          {/* Title Section */}
          <div className="text-center mb-10 sm:mb-16">
            <h1 className="font-heading font-black text-4xl sm:text-5xl lg:text-6xl tracking-tight text-[#171717] mb-4">
              Terms of Service
            </h1>
            <p className="text-gray-500 font-medium tracking-wide">
              Last Updated: June 22, 2026 • Effective Date: June 22, 2026
            </p>
          </div>

          <div className="w-full grid grid-cols-1 lg:grid-cols-4 gap-8 lg:gap-12">
          {/* Left Column - Desktop Table of Contents (Sticky Wrapper) */}
          <div className="hidden lg:block lg:col-span-1">
            <aside className="sticky top-28 bg-white/50 border border-[#eadcc5]/70 rounded-2xl p-6 shadow-sm">
              <h3 className="font-heading font-bold text-[#171717] text-sm uppercase tracking-widest mb-4">
                Table of Contents
              </h3>
              <nav className="flex flex-col gap-2">
                {SECTIONS.map((section) => {
                  const isActive = activeSection === section.id;
                  return (
                    <button
                      key={section.id}
                      onClick={() => scrollToSection(section.id)}
                      className={`text-left text-sm py-2 px-3 rounded-lg font-semibold transition-all duration-200 ${
                        isActive
                          ? 'bg-[#3B5BDB] text-white shadow-sm translate-x-1'
                          : 'text-gray-500 hover:text-[#171717] hover:bg-white/70'
                      }`}
                    >
                      {section.title}
                    </button>
                  );
                })}
              </nav>
            </aside>
          </div>

          {/* Right Column - Content Panel */}
          <div className="lg:col-span-3 min-w-0 bg-white border border-[#eadcc5] rounded-3xl p-6 sm:p-10 shadow-sm leading-relaxed text-[16px] sm:text-[17px] text-gray-700">
            {/* Mobile Table of Contents Scroll list */}
            <div className="lg:hidden bg-gray-50 border border-gray-100 rounded-xl p-4 mb-6">
              <h3 className="font-heading font-bold text-xs uppercase tracking-wider text-gray-400 mb-2">
                Jump to Section
              </h3>
              <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none snap-x">
                {SECTIONS.map((section) => (
                  <button
                    key={section.id}
                    onClick={() => scrollToSection(section.id)}
                    className={`snap-center shrink-0 text-xs py-1.5 px-3 rounded-lg font-bold border transition-colors ${
                      activeSection === section.id
                        ? 'bg-[#3B5BDB] text-white border-[#3B5BDB]'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {section.title.split('. ')[1]}
                  </button>
                ))}
              </div>
            </div>

            {/* 1. Acceptance of Terms */}
            <section id="acceptance" className="scroll-mt-24 space-y-4 py-6 sm:py-8">
              <h2 className="font-heading font-extrabold text-2xl sm:text-3xl text-[#171717] flex items-center gap-3">
                <span className="w-2 h-6 bg-[#A0C4FF] rounded-full" />
                1. Acceptance of Terms
              </h2>
              <p>
                By accessing, browsing, or using the <strong>FFCS Timetable Planner</strong> (referred to as the &quot;Service,&quot; &quot;App,&quot; or &quot;Planner&quot;), 
                you acknowledge that you have read, understood, and agreed to be bound by these Terms of Service.
              </p>
              <p>
                If you are using the Service on behalf of a club, group, or academic division, you warrant that you have the authority to accept these terms on 
                their behalf. If you do not agree to these terms, you are prohibited from using the Service.
              </p>
            </section>

            <div className="py-2"><hr className="border-gray-100" /></div>

            {/* 2. Eligibility & Accounts */}
            <section id="eligibility" className="scroll-mt-24 space-y-4 py-6 sm:py-8">
              <h2 className="font-heading font-extrabold text-2xl sm:text-3xl text-[#171717] flex items-center gap-3">
                <span className="w-2 h-6 bg-[#BFA5EE] rounded-full" />
                2. Eligibility & Accounts
              </h2>
              <p>
                The FFCS Planner is custom-built for students of the Vellore Institute of Technology (VIT). 
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>Account Credentials:</strong> Access to save, retrieve, and sync timetables requires signing in via Google Sign-In. You must use your official university email ending in <code>@vitstudent.ac.in</code> to log in.</li>
                <li><strong>Responsibility:</strong> You are responsible for keeping your login credentials secure. Any operations performed under your student login will be deemed your sole responsibility.</li>
                <li><strong>Service Availability:</strong> We reserve the right to temporarily disable, suspend, or limit access to the Service or any student accounts without notice, particularly during maintenance cycles or server resource surges.</li>
              </ul>
            </section>

            <div className="py-2"><hr className="border-gray-100" /></div>

            {/* 3. Purpose & Use of the Planner */}
            <section id="purpose-use" className="scroll-mt-24 space-y-4 py-6 sm:py-8">
              <h2 className="font-heading font-extrabold text-2xl sm:text-3xl text-[#171717] flex items-center gap-3">
                <span className="w-2 h-6 bg-[#B8EDC0] rounded-full" />
                3. Purpose & Use of the Planner
              </h2>
              <div className="bg-amber-50 border border-amber-100 rounded-2xl p-6 mb-4">
                <h4 className="font-heading font-bold text-amber-900 text-lg mb-2 uppercase tracking-wide">
                  ⚠️ Critical Notice & Affiliation Disclaimer
                </h4>
                <p className="text-amber-950 text-sm leading-relaxed">
                  The FFCS Planner is an <strong>independent student-run project</strong> developed and maintained by the Microsoft Innovations Club (MIC), VIT Chennai. 
                  This application is <strong>not affiliated with, authorized, endorsed, or officially connected to the Vellore Institute of Technology (VIT)</strong> or any of its official administrative portals. 
                </p>
                <p className="text-amber-950 text-sm leading-relaxed mt-2">
                  The slot structures, course details, and scheduling algorithms are provided solely as planning aids. <strong>You cannot register for courses within this application.</strong> Actual course registration must be completed by you on the official VIT VTOP portal during the scheduled registration slot. We are not responsible for any registration failures, closed slots, or discrepancies.
                </p>
              </div>
            </section>

            <div className="py-2"><hr className="border-gray-100" /></div>

            {/* 4. Intellectual Property */}
            <section id="intellectual-property" className="scroll-mt-24 space-y-4 py-6 sm:py-8">
              <h2 className="font-heading font-extrabold text-2xl sm:text-3xl text-[#171717] flex items-center gap-3">
                <span className="w-2 h-6 bg-[#F9EEAA] rounded-full" />
                4. Intellectual Property
              </h2>
              <p>
                All elements of the Service, including the user interface, graphical designs, codebase, illustrations, and logos, are protected by intellectual property rules.
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>Ownership:</strong> The application is owned and managed by the Microsoft Innovations Club (MIC), VIT Chennai. Brand names, MIC logos, and custom illustrations belong to MIC.</li>
                <li><strong>Open Source Code:</strong> The source code of the project may be hosted publicly in repository environments. Your access to copy, edit, or distribute the codebase is governed strictly by the open-source license enclosed in the repository.</li>
              </ul>
            </section>

            <div className="py-2"><hr className="border-gray-100" /></div>

            {/* 5. Prohibited Conduct */}
            <section id="conduct" className="scroll-mt-24 space-y-4 py-6 sm:py-8">
              <h2 className="font-heading font-extrabold text-2xl sm:text-3xl text-[#171717] flex items-center gap-3">
                <span className="w-2 h-6 bg-[#BDD7FF] rounded-full" />
                5. Prohibited Conduct
              </h2>
              <p>
                To maintain a safe and stable planning platform for all students, you agree not to:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Attempt to bypass API endpoints, rate limiters, or authentication safeguards.</li>
                <li>Engage in automated scraping, spidering, or bulk exporting of course and slot details via scripts in a manner that degrades performance.</li>
                <li>Inject malicious scripts, payloads, or corrupted files into saved fields or feedback submission nodes.</li>
                <li>Impersonate other students or access accounts that do not belong to you.</li>
                <li>Use the planner for commercial purposes or represent it as an official university channel.</li>
              </ul>
            </section>

            <div className="py-2"><hr className="border-gray-100" /></div>

            {/* 6. Disclaimer of Warranties */}
            <section id="warranties" className="scroll-mt-24 space-y-4 py-6 sm:py-8">
              <h2 className="font-heading font-extrabold text-2xl sm:text-3xl text-[#171717] flex items-center gap-3">
                <span className="w-2 h-6 bg-[#E0D4F5] rounded-full" />
                6. Disclaimer of Warranties
              </h2>
              <p className="italic">
                THE SERVICE IS PROVIDED ON AN &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; BASIS. WE EXPRESSLY DISCLAIM ALL WARRANTIES OF ANY KIND, 
                WHETHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.
              </p>
              <p>
                Although we make every effort to seed the database with the most accurate slot, course, and professor details for the active semester, we do not 
                warrant that:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>The data is completely accurate, error-free, or identical to VTOP. Slots and course availabilities can change dynamically on the university end.</li>
                <li>The Service will be uninterrupted, secure, or free from server glitches during high-traffic registration periods.</li>
                <li>Calculated timetable options will be guaranteed to remain clash-free if university schedules are amended.</li>
              </ul>
            </section>

            <div className="py-2"><hr className="border-gray-100" /></div>

            {/* 7. Limitation of Liability */}
            <section id="liability" className="scroll-mt-24 space-y-4 py-6 sm:py-8">
              <h2 className="font-heading font-extrabold text-2xl sm:text-3xl text-[#171717] flex items-center gap-3">
                <span className="w-2 h-6 bg-[#FFD6E0] rounded-full" />
                7. Limitation of Liability
              </h2>
              <p className="italic">
                IN NO EVENT SHALL THE MICROSOFT INNOVATIONS CLUB, ITS MEMBERS, DEPOSITORIES, OR DEVELOPERS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, 
                SPECIAL, CONSEQUENTIAL, OR EXEMPLARY DAMAGES (INCLUDING, BUT NOT LIMITED TO, LOSS OF TIME, ACADEMIC DISADVANTAGE, REGISTRATION FAILURES, 
                OR SYSTEM DOWNTIMES) RESULTING FROM YOUR USE OR INABILITY TO USE THE PLANNER.
              </p>
              <p>
                Students are strongly encouraged to cross-reference their draft schedules generated on this planner with the official VIT slot metrics and VTOP charts 
                before registration.
              </p>
            </section>

            <div className="py-2"><hr className="border-gray-100" /></div>

            {/* 8. Changes to Terms */}
            <section id="changes" className="scroll-mt-24 space-y-4 py-6 sm:py-8">
              <h2 className="font-heading font-extrabold text-2xl sm:text-3xl text-[#171717] flex items-center gap-3">
                <span className="w-2 h-6 bg-[#B8F0E0] rounded-full" />
                8. Changes to Terms
              </h2>
              <p>
                We reserve the right to amend or update these Terms of Service at any time. When updates are published, the &quot;Last Updated&quot; timestamp at the top 
                of this page will be revised. Your continued use of the application following the posting of changes constitutes your agreement to the updated terms.
              </p>
            </section>

            <div className="py-2"><hr className="border-gray-100" /></div>

            {/* 9. Contact Us */}
            <section id="contact" className="scroll-mt-24 space-y-4 py-6 sm:py-8">
              <h2 className="font-heading font-extrabold text-2xl sm:text-3xl text-[#171717] flex items-center gap-3">
                <span className="w-2 h-6 bg-[#A0C4FF] rounded-full" />
                9. Contact Us
              </h2>
              <p>
                If you have questions regarding these Terms of Service, or require help with the planner, please feel free to reach out:
              </p>
              <div className="bg-[#FFF8E7] border border-[#eadcc5] rounded-2xl p-6 space-y-3">
                <p>
                  <strong>Club:</strong> Microsoft Innovations Club, VIT Chennai
                </p>
                <p>
                  <strong>Email:</strong> <a href="mailto:mic.vit.chennai@gmail.com" className="text-[#3B5BDB] font-bold hover:underline">mic.vit.chennai@gmail.com</a>
                </p>
                <p>
                  <strong>Web:</strong> <a href="https://microsoftinnovations.club" target="_blank" rel="noopener noreferrer" className="text-[#3B5BDB] font-bold hover:underline">microsoftinnovations.club</a>
                </p>
              </div>
            </section>
          </div>
        </div>
      </div>
      </div>

      {/* Footer */}
      <footer className="py-12 border-t border-[#eadcc5]/80 mt-16 text-center text-sm text-gray-500 font-semibold tracking-wider uppercase bg-white/30">
        <div>FFCS PLANNER © {new Date().getFullYear()}</div>
        <div className="mt-1 text-xs text-gray-400">DESIGNED & BUILT WITH ❤️ BY MICROSOFT INNOVATIONS CLUB</div>
      </footer>
    </div>
  );
}
