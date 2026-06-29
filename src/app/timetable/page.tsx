'use client';

import { useFeatureFlagEnabled } from '@posthog/react';
import { FEATURE_FLAGS } from '@/lib/featureFlags';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import type { AxiosError } from 'axios';
import posthog from 'posthog-js';
import LoginModal from '@/components/loginPopup';
import Image from 'next/image';
import { useTimetable } from '@/lib/TimeTableContext';
import { exportToPDF } from '@/lib/exportToPDF';
import { generateTT } from '@/lib/utils';
import { getSlotViewPayload } from '@/lib/slot-view';
import { getCourseCredits } from '@/lib/chennaiCatalog';
import chennaiCourses from '@/data/all_data_chennai';

/* ── Venue lookup from raw data ── */
const _venueIndex = new Map<string, string>();
chennaiCourses.forEach((r) => {
    if ((r as any).VENUE) _venueIndex.set(`${r.CODE}|${r.SLOT}|${r.FACULTY}`, (r as any).VENUE);
});
import { lookupVenue } from '@/lib/sharedUtils';

// or if not already imported
// import { lookupVenue } from '../sharedUtils';
import { fullCourseData, timetableDisplayData } from '@/lib/type';
import { clearPlannerClientCache } from '@/lib/clientCache';
import { getShortCourseName } from '@/lib/courseDisplay';
import { getPlannerStoredValue } from '@/lib/plannerStorage';

const setCookie = (name: string, value: string) => {
    if (typeof document === 'undefined') return;
    document.cookie = `${name}=${value}; path=/; max-age=3600`;
};

const getCookie = (name: string): string | null => {
    if (typeof document === 'undefined') return null;
    const nameEQ = name + '=';
    const cookies = document.cookie.split(';');
    for (let cookie of cookies) {
        cookie = cookie.trim();
        if (cookie.indexOf(nameEQ) === 0) {
            return decodeURIComponent(cookie.substring(nameEQ.length));
        }
    }
    return null;
};

const THEORY_FILLED_COLOR = '#BFF0C8';
const THEORY_EMPTY_COLOR = '#E1F9E9';
const LAB_FILLED_COLOR = '#FFE78A';
const LAB_EMPTY_COLOR = '#FFF2BF';
const THEORY_POPUP_COLOR = '#CFF3D5';
const THEORY_POPUP_BORDER = '#6AA874';
const LAB_POPUP_COLOR = '#FFF0A6';
const LAB_POPUP_BORDER = '#8F8443';

function isSameSlot(a: timetableDisplayData | null, b: timetableDisplayData | null) {
    if (!a || !b) return false;
    return (
        a.courseCode === b.courseCode &&
        a.courseName === b.courseName &&
        a.slotName === b.slotName &&
        a.facultyName === b.facultyName
    );
}

type HighlightedCell = {
    rect: { top: number; left: number; width: number; height: number };
    label: string;
    courseCode: string;
    backgroundColor: string;
};

type SlotCategory = 'theory' | 'lab';

function getSlotTokens(slotName: string) {
    return slotName
        .split('+')
        .map(token => token.trim())
        .filter(Boolean);
}

function TimetableTable({
    scheduleRows,
    leftTimes,
    rightTimes,
    theoryGrid,
    labGrid,
    selectedSlot,
    openSelectedSlot,
    exportMode = false,
}: {
    scheduleRows: ReturnType<typeof getSlotViewPayload>['scheduleRows'];
    leftTimes: ReturnType<typeof getSlotViewPayload>['leftTimes'];
    rightTimes: ReturnType<typeof getSlotViewPayload>['rightTimes'];
    theoryGrid: (timetableDisplayData | null)[][];
    labGrid: (timetableDisplayData | null)[][];
    selectedSlot: timetableDisplayData | null;
    openSelectedSlot: (slot: timetableDisplayData, category: SlotCategory) => void;
    exportMode?: boolean;
}) {
    return (
        <table className={`w-full table-fixed border-collapse bg-white text-center min-w-225 xl:min-w-full ${exportMode ? '' : 'h-full'}`}>
            <thead className={exportMode ? '' : 'h-12 sticky top-0 z-20 shadow-sm'}>
                <tr className={`border-b-2 border-white ${exportMode ? 'h-18.5' : 'h-7.5'}`}>
                    <th className={`text-center font-bold text-black border-r-2 border-white bg-white ${exportMode ? 'w-37.5 p-3 text-[20px] leading-tight' : 'w-15 md:w-[5vw] p-0.5 text-[9px] leading-tight'}`}>Theory Hours</th>
                    {[...leftTimes, { theory: '', lab: '' }, ...rightTimes].map((t, i) => (
                        <th key={i} className={`text-center font-bold text-black border-r-2 border-white bg-white ${i === 6 ? (exportMode ? 'w-10.5 px-0' : 'w-6 px-0') : (exportMode ? 'min-w-33 p-2 text-[16px] leading-tight' : 'min-w-12.5 p-0.5 text-[10px] leading-tight')}`}>
                            {t.theory ? t.theory.split('-').map((part, idx, arr) => (
                                <span key={idx} className="block whitespace-nowrap">{part}{idx < arr.length - 1 ? '-' : ''}</span>
                            )) : null}
                        </th>
                    ))}
                </tr>
                <tr className={`border-b-2 border-white ${exportMode ? 'h-18.5' : 'h-7.5'}`}>
                    <th className={`text-center font-bold text-black border-r-2 border-white bg-white ${exportMode ? 'w-37.5 p-3 text-[20px] leading-tight' : 'w-[60px] md:w-[5vw] p-0.5 text-[9px] leading-tight'}`}>Lab Hours</th>
                    {[...leftTimes, { theory: '', lab: '' }, ...rightTimes].map((t, i) => (
                        <th key={i} className={`text-center font-bold text-black border-r-2 border-white bg-white ${i === 6 ? (exportMode ? 'w-10.5 px-0' : 'w-6 px-0') : (exportMode ? 'min-w-33 p-2 text-[16px] leading-tight' : 'min-w-12.5 p-0.5 text-[10px] leading-tight')}`}>
                            {t.lab ? t.lab.split('-').map((part, idx, arr) => (
                                <span key={idx} className="block whitespace-nowrap">{part}{idx < arr.length - 1 ? '-' : ''}</span>
                            )) : null}
                        </th>
                    ))}
                </tr>
            </thead>
            <tbody className={exportMode ? 'bg-white' : 'bg-white h-full'}>
                {scheduleRows.map((row, rowIdx) => (
                    <tr key={row.day} className={exportMode ? '' : 'group h-[20%]'}>
                        <td className={`text-black text-center align-middle border-r-2 border-white bg-white font-bold ${exportMode ? 'w-37.5 p-0 text-[20px]' : 'w-15 md:w-[5vw] p-0 text-[9px]'}`}>{row.day}</td>
                        {Array.from({ length: 13 }).map((_, colIdx) => {
                            if (colIdx === 6) {
                                const lunchLetters = ['L', 'U', 'N', 'C', 'H'];
                                return (
                                    <td key="lunch-spacer" className={`border-r-2 border-white align-middle bg-[#f8f9fa] ${exportMode ? 'w-10.5' : 'w-6'}`}>
                                        <div className="flex h-full flex-col items-center justify-center">
                                            <span className={`font-black text-black opacity-80 ${exportMode ? 'text-[18px]' : 'text-[9px]'}`}>
                                                {lunchLetters[rowIdx]}
                                            </span>
                                        </div>
                                    </td>
                                );
                            }

                            const theoryCell = theoryGrid[rowIdx][colIdx];
                            const labCell = labGrid[rowIdx][colIdx];
                            const theoryBackgroundColor = theoryCell ? THEORY_FILLED_COLOR : THEORY_EMPTY_COLOR;
                            const labBackgroundColor = labCell ? LAB_FILLED_COLOR : LAB_EMPTY_COLOR;

                            let theoryLabel = '';
                            let labLabel = '';
                            if (colIdx < 6) {
                                theoryLabel = row.theoryLeft[colIdx].label;
                                labLabel = row.labLeft[colIdx].label;
                            } else {
                                theoryLabel = row.theoryRight[colIdx - 7].label;
                                labLabel = row.labRight[colIdx - 7].label;
                            }

                            return (
                                <td key={colIdx} className="align-top border-r-2 border-white p-0 bg-white">
                                    <div className={`grid w-full grid-rows-2 gap-0 ${exportMode ? 'min-h-41' : 'h-full min-h-17'}`}>
                                        <div
                                            data-slot-label={theoryLabel}
                                            data-slot-category="theory"
                                            data-bgcolor={theoryBackgroundColor}
                                            className={`relative flex flex-col items-center justify-center transition-all cursor-pointer ${theoryCell ? 'z-10' : ''} ${isSameSlot(selectedSlot, theoryCell) ? 'brightness-110' : ''} ${exportMode ? 'min-h-20.5 px-2.5 py-1.5' : 'h-full py-0'}`}
                                            style={{ backgroundColor: theoryBackgroundColor }}
                                            onClick={() => theoryCell && openSelectedSlot(theoryCell, 'theory')}
                                        >
                                            {theoryCell ? (
                                                <>
                                                    <span className={`font-bold text-black leading-tight ${exportMode ? 'text-[15px]' : 'text-[10px]'}`}>{theoryLabel}</span>
                                                    <span className={`font-bold text-black opacity-80 uppercase leading-tight ${exportMode ? 'mt-1 px-1 text-[13px]' : 'px-1 text-[8px] max-w-15.5 truncate'}`}>{theoryCell.courseCode}</span>
                                                    {exportMode && (
                                                        <span className={`mt-1 px-2 text-center font-semibold leading-tight text-black/85 wrap-break-word ${getShortCourseName(theoryCell.courseName).length > 25 ? 'text-[9px] line-clamp-3' : 'text-[11px] line-clamp-2'}`}>
                                                            {getShortCourseName(theoryCell.courseName)}
                                                        </span>
                                                    )}
                                                </>
                                            ) : (
                                                <span className={`font-bold text-[#4ea075] ${exportMode ? 'text-[15px]' : 'text-[10px]'}`}>{theoryLabel}</span>
                                            )}
                                        </div>

                                        <div
                                            data-slot-label={labLabel}
                                            data-slot-category="lab"
                                            data-bgcolor={labBackgroundColor}
                                            className={`relative flex flex-col items-center justify-center transition-all cursor-pointer ${labCell ? 'z-10' : ''} ${isSameSlot(selectedSlot, labCell) ? 'brightness-110' : ''} ${exportMode ? 'min-h-20.5 px-2.5 py-1.5' : 'h-full py-0'}`}
                                            style={{ backgroundColor: labBackgroundColor }}
                                            onClick={() => labCell && openSelectedSlot(labCell, 'lab')}
                                        >
                                            {labCell ? (
                                                <>
                                                    <span className={`font-bold text-black leading-tight ${exportMode ? 'text-[15px]' : 'text-[10px]'}`}>{labLabel}</span>
                                                    <span className={`font-bold text-black opacity-80 uppercase leading-tight ${exportMode ? 'mt-1 px-1 text-[13px]' : 'px-1 text-[8px] max-w-15.5 truncate'}`}>{labCell.courseCode}</span>
                                                    {exportMode && (
                                                        <span className={`mt-1 px-2 text-center font-semibold leading-tight text-black/85 wrap-break-word ${getShortCourseName(labCell.courseName).length > 25 ? 'text-[9px] line-clamp-3' : 'text-[11px] line-clamp-2'}`}>
                                                            {getShortCourseName(labCell.courseName)}
                                                        </span>
                                                    )}
                                                </>
                                            ) : (
                                                <span className={`font-bold text-[#d4a044] ${exportMode ? 'text-[15px]' : 'text-[10px]'}`}>{labLabel}</span>
                                            )}
                                        </div>
                                    </div>
                                </td>
                            );
                        })}
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

export default function TimetablePage() {
    const router = useRouter();
    const { data: session, status } = useSession();
    const { timetableData, setTimetableData } = useTimetable();

    const [currentIndex, setCurrentIndex] = useState(0);
    const [selectedSlot, setSelectedSlot] = useState<timetableDisplayData | null>(null);
    const [highlightedCells, setHighlightedCells] = useState<HighlightedCell[]>([]);
    const [selectedSlotCategory, setSelectedSlotCategory] = useState<SlotCategory | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [toast, setToast] = useState('');
    const [toastType, setToastType] = useState<'success' | 'error'>('success');
    const [clashMessage, setClashMessage] = useState<string | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [showSaveModal, setShowSaveModal] = useState(false);
    const [showDownloadModal, setShowDownloadModal] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);
    const [showShareModal, setShowShareModal] = useState(false);
    const [shareUrl, setShareUrl] = useState('');
    const [showLogin, setShowLogin] = useState(false);
    const [timetableTitle, setTimetableTitle] = useState('My Schedule');
    const [saveError, setSaveError] = useState('');
    const [isEditing, setIsEditing] = useState(false);
    const [saveOption, setSaveOption] = useState<'update' | 'new'>('update');
    const { scheduleRows, leftTimes, rightTimes } = useMemo(() => getSlotViewPayload(), []);

    const hasInitialized = useRef(false);

    // Load from cookies and generate if context is empty
    useEffect(() => {
        if (hasInitialized.current) return;
        hasInitialized.current = true;

        posthog.capture('timetable_builder_loaded');

        const editingId = getCookie('editingTimetableId');
        if (editingId) {
            setIsEditing(true);
            axios.get(`/api/timetables/${editingId}`)
                .then(res => {
                    if (res.data?.title) {
                        setTimetableTitle(res.data.title);
                    }
                })
                .catch(err => {
                    console.error('Failed to load editing timetable title:', err);
                });
        }

        if (!timetableData || timetableData.length === 0) {
            const savedCoursesRaw = getPlannerStoredValue('generatedTimetableCourses') || getPlannerStoredValue('preferenceCourses');
            if (savedCoursesRaw) {
                try {
                    setIsGenerating(true);
                    const savedCourses = JSON.parse(savedCoursesRaw) as fullCourseData[];
                    const { result, clashes } = generateTT(savedCourses);
                    setTimetableData(result);
                    setClashMessage(clashes);
                    if (clashes && clashes.length > 0) {
                        posthog.capture('timetable_clash_detected', {
                            clash_count: clashes.length,
                        });
                    }
                } catch (error) {
                    console.error('Error generating timetable:', error);
                } finally {
                    setIsGenerating(false);
                }
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const currentTT = useMemo(() => timetableData?.[currentIndex] || [], [timetableData, currentIndex]);
    const selectedCourses = useMemo(() => {
        const courseMap = new Map<string, { courseName: string; facultyName: string; slots: string[]; venues: string[]; credits: number }>();
        currentTT.forEach((slot) => {
            if (!courseMap.has(slot.courseCode)) {
                courseMap.set(slot.courseCode, {
                    courseName: slot.courseName,
                    facultyName: slot.facultyName,
                    slots: [],
                    venues: [],
                    credits: 0,
                });
            }
            const info = courseMap.get(slot.courseCode)!;
            if (!info.slots.includes(slot.slotName)) {
                info.slots.push(slot.slotName);
                info.venues.push(slot.venue || 'TBD');
                
                // Calculate credits for this component
                if (slot.courseCode.includes('__')) {
                    const codes = slot.courseCode.split('__');
                    const slots = slot.slotName.split('__');
                    info.credits += getCourseCredits(codes[0], slots[0], slot.facultyName);
                    if (codes[1] && slots[1]) {
                        info.credits += getCourseCredits(codes[1], slots[1], slot.facultyName);
                    }
                } else {
                    info.credits += getCourseCredits(slot.courseCode, slot.slotName, slot.facultyName);
                }
            }
        });
        return Array.from(courseMap.entries());
    }, [currentTT]);

    const totalCredits = useMemo(() => {
        return selectedCourses.reduce((sum, [, info]) => sum + info.credits, 0);
    }, [selectedCourses]);

    const exportCreditsLabel = totalCredits.toString();

    const showToast = useCallback((msg: string, type: 'success' | 'error' = 'success') => {
        setToast(msg);
        setToastType(type);
        setTimeout(() => setToast(''), 3000);
    }, []);

    const getRequestErrorMessage = useCallback((error: unknown, fallback: string) => {
        if (axios.isAxiosError(error)) {
            const axiosError = error as AxiosError<{ error?: string; detail?: string }>;
            return axiosError.response?.data?.error || axiosError.response?.data?.detail || fallback;
        }

        if (error instanceof Error && error.message) {
            return error.message;
        }

        return fallback;
    }, []);

    const clearSelectedSlot = useCallback(() => {
        setSelectedSlot(null);
        setHighlightedCells([]);
        setSelectedSlotCategory(null);
    }, []);

    const openSelectedSlot = useCallback((
        slot: timetableDisplayData,
        category: SlotCategory,
    ) => {
        const slotTokens = getSlotTokens(slot.slotName);
        const highlights: HighlightedCell[] = slotTokens.flatMap((token) => {
            const nodeList = document.querySelectorAll<HTMLElement>(`[data-slot-label="${token}"][data-slot-category="${category}"]`);
            return Array.from(nodeList).map((node) => {
                const rect = node.getBoundingClientRect();
                return {
                    rect: {
                        top: rect.top,
                        left: rect.left,
                        width: rect.width,
                        height: rect.height,
                    },
                    label: token,
                    courseCode: slot.courseCode,
                    backgroundColor: node.dataset.bgcolor || '#ffffff',
                };
            });
        });

        setSelectedSlot(slot);
        setHighlightedCells(highlights);
        setSelectedSlotCategory(category);
    }, []);

    const handleSave = async (customTitle?: string, options?: { skipRedirect?: boolean; makePublic?: boolean; saveAsNew?: boolean }) => {
        if (!session?.user?.email) {
            setShowLogin(true);
            showToast('Please sign in to save or share your timetable.');
            return null;
        }
        if (isSaving || currentTT.length === 0) return null;

        setSaveError('');
        setIsSaving(true);
        try {
            const editingTimetableId = getCookie('editingTimetableId');
            const title = customTitle?.trim() || timetableTitle.trim() || 'My Schedule';

            const slotsData = currentTT.map(s => ({
                slot: s.slotName,
                courseCode: s.courseCode,
                courseName: s.courseName,
                facultyName: s.facultyName,
                venue: s.venue || 'TBD',
            }));

            const saveAsNew = options?.saveAsNew ?? (saveOption === 'new');

            if (editingTimetableId && !saveAsNew) {
                // Update existing timetable
                const res = await axios.patch(`/api/timetables/${editingTimetableId}`, {
                    title,
                    slots: slotsData,
                    ...(options?.makePublic ? { isPublic: true } : {}),
                });

                if (res.data.success) {
                    const resolvedTitle = res.data?.timetable?.title;
                    if (typeof resolvedTitle === 'string' && resolvedTitle.trim().length > 0) {
                        setTimetableTitle(resolvedTitle);
                    }
                    posthog.capture('timetable_saved', {
                        mode: 'update',
                        slots_count: slotsData.length,
                        title_length: (resolvedTitle || title).length,
                    });
                    if (!options?.skipRedirect) {
                        setShowSaveModal(false);
                        if (resolvedTitle && resolvedTitle !== title) {
                            showToast(`Timetable updated as "${resolvedTitle}"`);
                        } else {
                            showToast('Timetable updated successfully!');
                        }
                        setTimeout(() => { router.refresh(); router.push('/saved'); }, 1200);
                    }
                    return { _id: editingTimetableId, shareId: null };
                }
            } else {
                // Create new timetable
                const res = await axios.post('/api/save-timetable', {
                    title,
                    slots: slotsData,
                    owner: session.user.email,
                    isPublic: options?.makePublic ?? false,
                });

                if (res.data.success) {
                    const resolvedTitle = res.data?.timetable?.title;
                    if (typeof resolvedTitle === 'string' && resolvedTitle.trim().length > 0) {
                        setTimetableTitle(resolvedTitle);
                    }
                    posthog.capture('timetable_saved', {
                        mode: 'create',
                        slots_count: slotsData.length,
                        title_length: (resolvedTitle || title).length,
                    });
                    // Update editing cookie so subsequent shares bind to the new save!
                    setCookie('editingTimetableId', res.data.timetable._id);


                    if (!options?.skipRedirect) {
                        setShowSaveModal(false);
                        if (resolvedTitle && resolvedTitle !== title) {
                            showToast(`Timetable saved as "${resolvedTitle}"`);
                        } else {
                            showToast('Timetable saved successfully!');
                        }
                        setTimeout(() => {
                            clearPlannerClientCache({ includeEditingState: true, clearPlannerState: false });
                            router.refresh();
                            router.push('/saved');
                        }, 1200);
                    }
                    return res.data.timetable;
                }
            }
        } catch (error) {
            console.error('Save error:', error);
            const message = getRequestErrorMessage(error, 'Failed to save timetable.');
            setSaveError(message);
            showToast(message, 'error');
        } finally {
            setIsSaving(false);
        }
        return null;
    };

    const handleDownload = async (target: 'timetable' | 'slots') => {
        console.log('handleDownload called', { currentTTLength: currentTT.length });
        if (currentTT.length === 0) {
            showToast('No timetable data to download.', 'error');
            window.alert('No timetable data to download.');
            return;
        }
        setIsDownloading(true);
        showToast('Preparing PDF...');
        try {
            await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
            const elementId = target === 'timetable' ? 'rat-export' : 'selected-courses-export';
            const filename = target === 'timetable'
                ? `timetable-option-${currentIndex + 1}.pdf`
                : `selected-courses-option-${currentIndex + 1}.pdf`;
            await exportToPDF(elementId, filename);
            showToast('PDF downloaded successfully!');
        } catch (error: unknown) {
            console.error('PDF error:', error);
            showToast('Failed to generate PDF. Please try again.', 'error');
            const message = error instanceof Error ? error.message : String(error);
            window.alert('Failed to generate PDF: ' + message);
        } finally {
            setIsDownloading(false);
            setShowDownloadModal(false);
        }
    };

    const copyToClipboard = async (text: string): Promise<boolean> => {
        // Try the modern Clipboard API first
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            try {
                await navigator.clipboard.writeText(text);
                return true;
            } catch {
                // Fall through to fallback
            }
        }
        // Fallback: create a temporary textarea and use execCommand
        try {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.left = '-9999px';
            textarea.style.top = '-9999px';
            document.body.appendChild(textarea);
            textarea.focus();
            textarea.select();
            const ok = document.execCommand('copy');
            document.body.removeChild(textarea);
            return ok;
        } catch {
            return false;
        }
    };

    const handleShare = async () => {
        console.log('handleShare called!');
        if (!session?.user?.email) {
            setShowLogin(true);
            showToast('Please sign in to share your timetable.', 'error');
            return;
        }
        if (currentTT.length === 0) {
            showToast('No timetable data to share.', 'error');
            return;
        }

        try {
            console.log('Starting share flow...');
            const editingTimetableId = getCookie('editingTimetableId');
            let shareId: string | null = null;

            if (editingTimetableId) {
                console.log('Editing existing timetable:', editingTimetableId);
                const slotsData = currentTT.map(s => ({
                    slot: s.slotName,
                    courseCode: s.courseCode,
                    courseName: s.courseName,
                    facultyName: s.facultyName,
                    venue: s.venue || 'TBD',
                }));
                await axios.patch(`/api/timetables/${editingTimetableId}`, {
                    slots: slotsData,
                });
                const timetableRes = await axios.get(`/api/timetables/${editingTimetableId}`);
                shareId = timetableRes.data.shareId;
            } else {
                console.log('Saving new private timetable...');
                const saved = await handleSave(timetableTitle, { skipRedirect: true, makePublic: true, saveAsNew: false });
                console.log('Save result:', saved);
                if (saved?.shareId) {
                    shareId = saved.shareId;
                } else if (saved?._id) {
                    const res = await axios.get(`/api/timetables/${saved._id}`);
                    shareId = res.data.shareId;
                } else {
                    return;
                }
            }

            console.log('Got shareId:', shareId);
            if (!shareId) {
                showToast('Could not generate share link.', 'error');
                return;
            }

            const url = `${window.location.origin}/share/${shareId}`;
            console.log('Attempting to copy:', url);
            const copied = await copyToClipboard(url);
            posthog.capture('timetable_shared', {
                source: editingTimetableId ? 'existing_timetable' : 'new_timetable',
                slots_count: currentTT.length,
                copied_to_clipboard: copied,
            });
            setShareUrl(url);
            setShowShareModal(true);
            if (copied) {
                showToast('Share link copied to clipboard!');
            }
        } catch (error: unknown) {
            console.error('Share error:', error);
            const message = getRequestErrorMessage(error, 'Failed to share timetable. Please try again.');
            showToast(message, 'error');
        }
    };

    /* Build the grid display data for rendering */
    const theoryGrid: (timetableDisplayData | null)[][] = Array.from({ length: 5 }, () => Array(13).fill(null));
    const labGrid: (timetableDisplayData | null)[][] = Array.from({ length: 5 }, () => Array(13).fill(null));

    currentTT.forEach(s => {
        const parts = s.slotName.split(/\+|__/);
        parts.forEach(p => {
            const cleanP = p.trim();
            // We need to find where this slot belongs in our 5x13 grid
            scheduleRows.forEach((row, dayIdx) => {
                row.theoryLeft.forEach((cell, colIdx) => { if (cell.key === cleanP) theoryGrid[dayIdx][colIdx] = s; });
                row.theoryRight.forEach((cell, colIdx) => { if (cell.key === cleanP) theoryGrid[dayIdx][colIdx + 7] = s; });
                row.labLeft.forEach((cell, colIdx) => { if (cell.key === cleanP) labGrid[dayIdx][colIdx] = s; });
                row.labRight.forEach((cell, colIdx) => { if (cell.key === cleanP) labGrid[dayIdx][colIdx + 7] = s; });
            });
        });
    });

    const sharePrompt = 'Check out my FFCS timetable';
    const whatsappShareUrl = `https://wa.me/?text=${encodeURIComponent(`${sharePrompt}: ${shareUrl}`)}`;
    const telegramShareUrl = `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(sharePrompt)}`;

    if (status === 'loading' || isGenerating) {
        return (
            <div className="min-h-screen bg-cream flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-blue-primary border-t-transparent rounded-full animate-spin" />
                    <p className="text-[16px] font-bold text-gray-700">Generating your timetables...</p>
                </div>
            </div>
        );
    }

    if (!timetableData || timetableData.length === 0) {
        return (
            <div className="min-h-screen bg-cream flex flex-col items-center justify-center p-6">
                <div className="bg-white rounded-3xl p-8 md:p-10 max-w-md w-full text-center shadow-[0_20px_50px_rgba(74,54,30,0.06)] border border-[#fdf6e2] flex flex-col items-center gap-6 animate-lucid-fade-up">
                    
                    {/* Warning Shield Icon */}
                    <div className="w-16 h-16 rounded-full bg-[#FEF2F2] flex items-center justify-center border border-[#FEE2E2] text-[#EF4444]">
                        <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0-10.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.75c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.57-.598-3.75h-.152c-3.196 0-6.1-1.249-8.25-3.286Zm0 13.036h.008v.008H12v-.008Z" />
                        </svg>
                    </div>

                    <div className="flex flex-col gap-2">
                        <h1 className="text-[26px] font-black text-black leading-tight">No Timetables Found</h1>
                        <p className="text-gray-600 font-medium text-[14px] leading-relaxed px-2">
                            {clashMessage || "We couldn't generate any non-clashing combinations based on your selections."}
                        </p>
                    </div>

                    <div className="w-full h-px bg-gray-100" />

                    {/* Troubleshooting Suggestions */}
                    <div className="text-left bg-gray-50/50 rounded-2xl p-4 w-full border border-gray-100/80">
                        <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block mb-2">Suggestions</span>
                        <ul className="text-[13px] text-gray-600 space-y-1.5 list-disc list-inside font-medium">
                            <li>Check for overlapping course slots.</li>
                            <li>Try deselecting some optional courses.</li>
                            <li>Enable more slot options in preferences.</li>
                        </ul>
                    </div>

                    <button
                        onClick={() => {
                            router.push('/preferences');
                        }}
                        className="w-full py-3.5 bg-[#A0C4FF] hover:bg-[#8ab2f2] text-black font-black rounded-2xl shadow-[0_8px_30px_rgba(160,196,255,0.25)] hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer text-[14px]"
                    >
                        Back to Selection
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="h-screen bg-[#F5E6D3] overflow-hidden">
            {/* Toast */}
            {toast && (
                <div 
                    className="fixed top-8 right-8 flex items-center gap-3.5 border rounded-2xl p-4 shadow-xl pointer-events-auto max-w-md animate-[slideIn_0.3s_ease] text-white"
                    style={{
                        backgroundColor: toastType === 'error' ? '#e11d48' : '#059669',
                        borderColor: toastType === 'error' ? '#be123c' : '#047857',
                        zIndex: 99999,
                    }}
                >
                    <span 
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                        style={{
                            backgroundColor: toastType === 'error' ? '#9f1239' : '#065f46',
                            color: '#ffffff',
                        }}
                    >
                        {toastType === 'error' ? (
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10"></circle>
                                <line x1="12" y1="8" x2="12" y2="12"></line>
                                <line x1="12" y1="16" x2="12.01" y2="16"></line>
                            </svg>
                        ) : (
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12"></polyline>
                            </svg>
                        )}
                    </span>
                    <p className="text-[14px] font-bold leading-tight flex-1">
                        {toast}
                    </p>
                    <button 
                        onClick={() => setToast('')}
                        className="transition-colors ml-2 bg-none border-none p-1 cursor-pointer flex items-center justify-center"
                        style={{
                            color: toastType === 'error' ? '#ffe4e6' : '#d1fae5',
                        }}
                        aria-label="Close"
                        onMouseEnter={(e) => e.currentTarget.style.color = '#ffffff'}
                        onMouseLeave={(e) => e.currentTarget.style.color = toastType === 'error' ? '#ffe4e6' : '#d1fae5'}
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>
            )}

            <div className="h-full px-[clamp(12px,1.5vw,24px)] pt-[clamp(10px,1vh,18px)] pb-40 md:pb-29">
                <div className="w-full max-w-450 h-full mx-auto flex flex-col min-h-0">
                    <div data-tour="timetable-intro" className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-4 px-2 pt-4.5 pb-2 shrink-0">
                        <h1 className="text-[24px] font-bold text-black">Timetables Generated</h1>
                        <p className="text-[11px] sm:text-[13px] text-gray-500 font-medium italic">
                            *Click on the slot to view more details of the subject...
                        </p>
                    </div>

                    {/* Main Table Container */}
                    <div data-tour="timetable-grid" className="bg-white rounded-[18px] shadow-[0_8px_30px_rgb(0,0,0,0.02)] border border-white flex-1 min-h-0 overflow-hidden flex flex-col p-3" id="timetable-grid">

                        <div id="rat" className="flex-1 min-h-0 overflow-auto scrollbar-thin rounded-[14px] border border-[#f1f1f1]">
                            <div className="h-full">
                                <TimetableTable
                                    scheduleRows={scheduleRows}
                                    leftTimes={leftTimes}
                                    rightTimes={rightTimes}
                                    theoryGrid={theoryGrid}
                                    labGrid={labGrid}
                                    selectedSlot={selectedSlot}
                                    openSelectedSlot={openSelectedSlot}
                                />
                            </div>
                        </div>

                        {/* Pagination & Action Controls */}
                        <div className="flex flex-wrap items-center justify-between pt-2 mt-2 gap-3 shrink-0 w-full border-t border-[#f2ede3]">
                            {/* Pagination */}
                            <div data-tour="timetable-pagination" className="flex items-center gap-1 bg-[#A0C4FF]/80 p-1.5 md:p-2 rounded-xl shadow-sm">
                                <button
                                    onClick={() => setCurrentIndex(0)}
                                    className="w-6 h-6 md:w-8 md:h-8 flex items-center justify-center rounded-md md:rounded-lg text-black hover:bg-white/40 transition-colors font-bold text-[14px] md:text-lg"
                                >
                                    «
                                </button>
                                <div className="flex gap-1">
                                    {[0, 1, 2, 3].map(idx => (
                                        idx < (timetableData?.length || 0) && (
                                            <button
                                                key={idx}
                                                onClick={() => setCurrentIndex(idx)}
                                                className={`w-6 h-6 md:w-8 md:h-8 flex items-center justify-center rounded-md md:rounded-lg font-bold text-[12px] md:text-sm transition-all ${currentIndex === idx
                                                    ? 'bg-white text-black shadow-sm'
                                                    : 'bg-transparent text-black hover:bg-white/40'
                                                    }`}
                                            >
                                                {idx + 1}
                                            </button>
                                        )
                                    ))}
                                </div>
                                <button
                                    onClick={() => setCurrentIndex((timetableData?.length || 1) - 1)}
                                    className="w-6 h-6 md:w-8 md:h-8 flex items-center justify-center rounded-md md:rounded-lg text-black hover:bg-white/40 transition-colors font-bold text-[14px] md:text-lg"
                                >
                                    »
                                </button>
                            </div>

                            {/* Action Bar */}
                            <div className="grid grid-cols-3 sm:flex sm:flex-row items-stretch sm:items-center justify-end gap-1.5 md:gap-3 w-full sm:w-auto">
                                <button
                                    onClick={handleShare}
                                    className="col-span-1 sm:col-span-auto flex items-center justify-center gap-1 md:gap-2 bg-[#A0C4FF] hover:bg-[#8ab2f2] text-black font-semibold py-2.5 md:py-2.5 px-1 md:px-6 rounded-xl transition-all shadow-sm hover:shadow-md active:scale-95 text-[12px] md:text-[14px] w-full sm:w-auto"
                                >
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13" /></svg>
                                    Share
                                </button>
                                <button
                                    onClick={() => setShowDownloadModal(true)}
                                    className="col-span-1 sm:col-span-auto flex items-center justify-center gap-1 md:gap-2 bg-[#C8F7DC] hover:bg-[#b0eac8] text-black font-semibold py-2 md:py-2.5 px-1 md:px-6 rounded-xl transition-all shadow-sm hover:shadow-md active:scale-95 text-[12px] md:text-[14px] w-full sm:w-auto"
                                >
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
                                    Download
                                </button>
                                <button
                                    onClick={() => {
                                        if (!session?.user?.email) {
                                            setShowLogin(true);
                                            showToast('Please sign in to save your timetable.', 'error');
                                            return;
                                        }
                                        setShowSaveModal(true);
                                    }}
                                    disabled={isSaving}
                                    className="col-span-1 sm:col-span-auto flex items-center justify-center gap-1 md:gap-2 bg-[#F9A8D4]/60 hover:bg-[#F9A8D4]/80 text-black font-semibold py-2 md:py-2.5 px-1 md:px-6 rounded-xl transition-all shadow-sm hover:shadow-md active:scale-95 disabled:opacity-50 text-[12px] md:text-[14px] w-full sm:w-auto"
                                >
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" /></svg>
                                    Save
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Bottom Navigation */}
            <div
                data-tour="timetable-bottom-navigation"
                className="fixed bottom-0 left-0 right-0 z-40 bg-[#F5E6D3] py-6 px-[clamp(16px,2vw,32px)] w-full flex justify-center"
                style={{ fontFamily: 'Inter, Arial, Helvetica, sans-serif' }}
            >
                <div className="flex flex-wrap md:flex-nowrap items-center justify-between gap-2 w-full">
                    <div className="flex items-center justify-start gap-3 shrink-0">
                        <button
                            type="button"
                            onClick={() => router.push('/')}
                            aria-label="Go to home page"
                            title="Home"
                            className="bg-white rounded-xl p-2.5 md:p-3 shadow-sm flex items-center justify-center min-w-12 min-h-12 md:min-w-14.5 md:min-h-14.5 hover:bg-gray-50 transition-colors shrink-0"
                        >
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="w-[22px] h-[22px] md:w-6 md:h-6 text-gray-800"
                                aria-hidden="true"
                            >
                                <path d="M3 10.5L12 3l9 7.5" />
                                <path d="M5 9.5V21h14V9.5" />
                                <path d="M9 21v-6h6v6" />
                            </svg>
                        </button>

                        {/* LEFT - USER BOX */}
                        <div className="hidden md:flex bg-white rounded-xl p-3 shadow-sm items-center gap-3 w-auto overflow-hidden">
                            {session?.user?.image ? (
                                <Image src={session.user.image} alt="User avatar" width={36} height={36} className="w-9 h-9 rounded-lg border border-gray-100 shrink-0" referrerPolicy="no-referrer" />
                            ) : (
                                <div className="w-9 h-9 bg-gray-300 rounded-lg flex items-center justify-center font-bold text-white text-sm shrink-0">
                                    {session?.user?.name?.[0] || "?"}
                                </div>
                            )}
                            <span className="text-gray-800 text-sm font-bold truncate max-w-50 pr-2">
                                {session?.user?.name || "Guest"}
                            </span>
                        </div>
                    </div>

                    {/* CENTER - STEPS BOX */}
                    <div className="bg-white rounded-xl p-2 shadow-sm flex flex-wrap justify-center items-center gap-2 w-full sm:w-auto order-last md:order-0 mt-2 md:mt-0">
                        {[1, 2, 3, 4].map((num) => (
                            <button
                                key={num}
                                onClick={() => {
                                    if (num === 1) router.push('/preferences');
                                    if (num === 2) router.push('/courses');
                                    if (num === 3) router.push('/timetable');
                                    if (num === 4) {
                                        if (!session?.user?.email) {
                                            setShowLogin(true);
                                            showToast('Please sign in to continue to saved timetables.', 'error');
                                            return;
                                        }
                                        router.push('/saved');
                                    }
                                }}
                                className={`h-9.5 flex items-center justify-center rounded-md font-bold text-sm cursor-pointer transition-colors border-none ${
                                    num === 3
                                        ? 'bg-[#A0C4FF] text-black px-3.5 md:px-4 min-w-8 md:min-w-9.5'
                                        : 'bg-[#A0C4FF]/40 text-black min-w-8.5 md:min-w-9.5'
                                }`}
                            >
                                {num === 3 ? '3. Timetable' : num}
                            </button>
                        ))}
                    </div>

                    {/* RIGHT - ACTION BOX */}
                    <div className="flex gap-2 lg:gap-3 justify-end shrink-0">
                        <button
                            onClick={() => router.push('/courses')}
                            className="px-6 md:px-8 py-2.5 md:py-3 bg-[#f1eacb] hover:bg-[#E8DDB8] border-2 border-[#A0C4FF] rounded-[10px] font-bold text-[13px] md:text-sm text-black transition-all duration-200 cursor-pointer"
                        >
                            Previous
                        </button>
                        <button
                            onClick={() => {
                                if (!session?.user?.email) {
                                    setShowLogin(true);
                                    showToast('Please sign in to continue to saved timetables.', 'error');
                                    return;
                                }
                                router.push('/saved');
                            }}
                            className="px-7 md:px-10 py-2.5 md:py-3 bg-[#A0C4FF] hover:bg-[#90B4EF] rounded-[10px] font-bold text-[13px] md:text-sm text-black transition-all duration-200 cursor-pointer"
                        >
                            Next
                        </button>
                    </div>
                </div>
            </div>

            <div className="pointer-events-none fixed -left-2500 -top-2500" aria-hidden="true">
                <div id="rat-export" className="w-600 bg-[#F8E8D2] p-12 font-sans">
                    <div className="rounded-4xl border border-[#efe7d6] bg-[#FFFBF0] p-8 shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
                        <div className="mb-8 flex items-center gap-5 px-1">
                            <h1 className="text-[42px] font-bold text-black">{timetableTitle || 'My Schedule'}</h1>
                            <div className="rounded-2xl border-2 border-green-400 bg-green-100 px-5 py-3 text-[22px] font-semibold text-green-800">
                                PDF Export
                            </div>
                        </div>
                        <div className="overflow-hidden rounded-3xl border border-[#ece6d8] bg-white p-6 relative">
                            {/* Watermark overlay */}
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30 opacity-[0.035]">
                                <img src="/mic-logo.png" alt="" className="w-[450px] h-[450px] object-contain select-none" />
                            </div>
                            <TimetableTable
                                scheduleRows={scheduleRows}
                                leftTimes={leftTimes}
                                rightTimes={rightTimes}
                                theoryGrid={theoryGrid}
                                labGrid={labGrid}
                                selectedSlot={null}
                                openSelectedSlot={openSelectedSlot}
                                exportMode
                            />
                        </div>
                        <div className="mt-8 pb-2 text-center text-[15px] text-gray-500/80 font-semibold tracking-wide">
                            Generated via FFCS Planner • Made with ❤️ by Microsoft Innovation Club
                        </div>
                    </div>
                </div>
                <div id="selected-courses-export" className="w-300 bg-[#F8E8D2] p-12 font-sans">
                    <div className="rounded-[36px] border border-[#d9d9d9] bg-white px-10 pt-8 pb-10 shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
                        <div className="mb-8 flex min-h-20 items-center justify-center border-b border-[#ececec] px-6 pb-6">
                            <h2 className="m-0 text-center text-[34px] leading-[1.15] font-black text-black">
                                {timetableTitle || 'Selected Courses'}
                            </h2>
                        </div>
                        <div className="overflow-hidden border-y border-[#2c2c2c] bg-white relative" style={{ marginBottom: 32 }}>
                            {/* Watermark overlay */}
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30 opacity-[0.035]">
                                <img src="/mic-logo.png" alt="" className="w-[300px] h-[300px] object-contain select-none" />
                            </div>
                            <table className="w-full border-collapse text-center">
                                <thead className="bg-[#D9EBE5]">
                                    <tr>
                                        <th className="w-[15%] border-r border-[#d9e2de] px-5 py-4 text-[17px] font-black text-black">Slot</th>
                                        <th className="w-[18%] border-r border-[#d9e2de] px-5 py-4 text-[17px] font-black text-black">Course Code</th>
                                        <th className="w-[32%] border-r border-[#d9e2de] px-5 py-4 text-[17px] font-black text-black">Course Title</th>
                                        <th className="w-[18%] border-r border-[#d9e2de] px-5 py-4 text-[17px] font-black text-black">Faculty</th>
                                        <th className="w-[9%] border-r border-[#d9e2de] px-5 py-4 text-[17px] font-black text-black">Venue</th>
                                        <th className="w-[8%] px-5 py-4 text-[17px] font-black text-black">Credits</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {selectedCourses.map(([code, info]) => (
                                        <tr key={code} className="border-t border-[#2c2c2c]">
                                            <td className="px-5 py-4 text-[16px] font-medium text-black whitespace-pre-wrap">{info.slots.join('\n')}</td>
                                            <td className="px-5 py-4 text-[16px] font-medium text-black">{code}</td>
                                            <td className={`px-5 py-4 font-medium text-black ${info.courseName.length > 40 ? 'text-[13px]' : 'text-[16px]'}`}>{info.courseName}</td>
                                            <td className={`px-5 py-4 font-medium text-black ${info.facultyName.length > 25 ? 'text-[13px]' : 'text-[16px]'}`}>{info.facultyName}</td>
                                            <td className="px-5 py-4 text-[16px] font-medium text-black whitespace-pre-wrap">{info.venues.join('\n')}</td>
                                            <td className="px-5 py-4 text-[16px] font-medium text-black">{info.credits}</td>
                                        </tr>
                                    ))}
                                    <tr className="border-t border-[#2c2c2c] bg-[#E7E7E7]">
                                        <td colSpan={6} className="px-5 py-4 text-center text-[18px] font-black text-black">
                                            Total Credits: {exportCreditsLabel}
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                        <div className="mt-8 pb-2 text-center text-[15px] text-gray-500/80 font-semibold tracking-wide">
                            Generated via FFCS Planner • Made with ❤️ by Microsoft Innovation Club
                        </div>
                    </div>
                </div>
            </div>

            {/* Popover */}
            {selectedSlot && (
                <div className="slot-detail-backdrop fixed inset-0 z-500 flex items-center justify-center px-4" onClick={clearSelectedSlot}>
                    {highlightedCells.map((highlightedCell) => (
                        <div
                            key={`${highlightedCell.label}-${highlightedCell.rect.top}-${highlightedCell.rect.left}`}
                            className="pointer-events-none fixed z-505 flex flex-col items-center justify-center shadow-[0_12px_24px_rgba(0,0,0,0.14)]"
                            style={{
                                top: highlightedCell.rect.top,
                                left: highlightedCell.rect.left,
                                width: highlightedCell.rect.width,
                                height: highlightedCell.rect.height,
                                backgroundColor: selectedSlotCategory === 'theory' ? THEORY_POPUP_COLOR : LAB_POPUP_COLOR,
                            }}
                        >
                            <span className="text-[10px] font-bold leading-tight text-black">{highlightedCell.label}</span>
                            <span className="max-w-15.5 truncate px-1 text-[8px] font-bold uppercase leading-tight text-black opacity-80">
                                {highlightedCell.courseCode}
                            </span>
                        </div>
                    ))}
                    <div
                        className="relative z-510 flex shrink-0 flex-col animate-[scaleIn_0.2s_ease] overflow-hidden rounded-xl border-[1.5px] px-5 pt-5 pb-4"
                        style={{
                            width: '335px',
                            height: '312px',
                            maxWidth: '92vw',
                            backgroundColor: selectedSlotCategory === 'theory' ? THEORY_POPUP_COLOR : LAB_POPUP_COLOR,
                            borderColor: selectedSlotCategory === 'theory' ? THEORY_POPUP_BORDER : LAB_POPUP_BORDER,
                        }}
                        onClick={e => e.stopPropagation()}
                    >
                        <button
                            onClick={clearSelectedSlot}
                            className="absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full text-black/80 transition-colors hover:bg-black/5 hover:text-black"
                            aria-label="Close course details"
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3"><path d="M18 6L6 18M6 6l12 12" /></svg>
                        </button>

                        <div className="pr-8">
                            <h2 className={`text-center font-black leading-[1.1] text-black ${((selectedSlot.courseCode?.length || 0) + (selectedSlot.courseName?.length || 0)) > 40 ? 'text-[17px]' : 'text-[22px]'}`}>
                                {selectedSlot.courseCode} - {selectedSlot.courseName}
                            </h2>
                            <p className="mt-2 text-center text-[18px] font-black text-black">
                                Slot: {selectedSlot.slotName}
                            </p>
                        </div>

                        <div className="mt-4 flex flex-1 flex-col justify-evenly">
                            <p className="text-[16px] leading-[1.35] text-black">
                                <span className="font-black">Faculty Name:</span>{' '}
                                <span className={`font-semibold text-black/75 ${(selectedSlot.facultyName?.length || 0) > 25 ? 'text-[13px] leading-tight block' : ''}`}>{selectedSlot.facultyName || '-'}</span>
                            </p>
                            <p className="text-[16px] leading-[1.35] text-black">
                                <span className="font-black">Course Name:</span>{' '}
                                <span className={`font-semibold text-black/75 ${(selectedSlot.courseName?.length || 0) > 35 ? 'text-[13px] leading-tight block' : ''}`}>{selectedSlot.courseName || '-'}</span>
                            </p>
                            <p className="text-[16px] leading-[1.35] text-black">
                                <span className="font-black">Course Code:</span>{' '}
                                <span className="font-semibold text-black/75">{selectedSlot.courseCode || '-'}</span>
                            </p>
                            <p className="text-[16px] leading-[1.35] text-black">
                                <span className="font-black">Timing:</span>{' '}
                                <span className="font-semibold text-black/75">{selectedSlot.slotName || '-'}</span>
                            </p>
                            <p className="text-[16px] leading-[1.35] text-black">
                                <span className="font-black">Classroom:</span>{' '}
                                <span className="font-semibold text-black/75">
                                    {(() => {
                                        const v = selectedSlot.venue;
                                        if (v && v !== 'TBD') return v;
                                        return lookupVenue(selectedSlot.courseCode, selectedSlot.slotName, selectedSlot.facultyName);
                                    })()}
                                </span>
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {showDownloadModal && (
                <div className="fixed inset-0 z-520 flex items-center justify-center bg-black/35 px-4 backdrop-blur-sm" onClick={() => !isDownloading && setShowDownloadModal(false)}>
                    <div
                        className="relative w-full max-w-118 animate-[scaleIn_0.2s_ease] overflow-hidden rounded-[30px] border border-[#eadcc5] bg-[#FFF8E7] p-7 shadow-[0_24px_70px_rgba(74,54,30,0.18)] sm:p-8"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {isDownloading ? (
                            <div className="flex flex-col items-center justify-center py-10">
                                <div className="h-12 w-12 animate-spin rounded-full border-4 border-[#3B5BDB]/20 border-t-[#3B5BDB] shadow-md"></div>
                                <h3 className="mt-6 text-[20px] font-black text-black">Generating PDF...</h3>
                                <p className="mt-2 text-center text-[14px] font-medium leading-relaxed text-[#6b6257]">Please wait, we are assembling your schedule.</p>
                            </div>
                        ) : (
                            <>
                                <div className="mb-4! flex items-start gap-4">
                                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#C8F7DC]/80 text-black shadow-[0_10px_22px_rgba(200,247,220,0.3)]">
                                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                            <path d="M7 10l5 5 5-5" />
                                            <path d="M12 15V3" />
                                        </svg>
                                    </div>
                                    <div>
                                        <h2 className="text-[24px] font-black leading-tight text-black">Download PDF</h2>
                                        <p className="mt-1 text-[14px] font-medium leading-relaxed text-[#6b6257]">Choose the timetable view or selected courses list.</p>
                                    </div>
                                </div>

                                <div className="mb-4! flex flex-col gap-2 sm:grid-cols-2">
                                    <button
                                        onClick={() => handleDownload('timetable')}
                                        className="flex min-h-16 items-center justify-center gap-1 rounded-xl border border-[#bfead0] bg-[#C8F7DC] px-5 py-4 text-[16px] font-semibold text-black shadow-[0_8px_20px_rgba(74,54,30,0.05)] transition-all hover:bg-[#b0eac8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8F7DC] active:scale-[0.98]"
                                    >
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                            <rect x="3" y="4" width="18" height="16" rx="2" />
                                            <path d="M7 8h10" />
                                            <path d="M7 12h10" />
                                            <path d="M7 16h6" />
                                        </svg>
                                        Timetable
                                    </button>
                                    <button
                                        onClick={() => handleDownload('slots')}
                                        className="flex min-h-16 items-center justify-center gap-3 rounded-xl border border-[#d8e5fb] bg-[#A0C4FF] px-5 py-4 text-[16px] font-semibold text-black shadow-[0_8px_20px_rgba(74,54,30,0.05)] transition-all hover:bg-[#8fb6f2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A0C4FF]/70 active:scale-[0.98]"
                                    >
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                            <path d="M8 6h13" />
                                            <path d="M8 12h13" />
                                            <path d="M8 18h13" />
                                            <path d="M3 6h.01" />
                                            <path d="M3 12h.01" />
                                            <path d="M3 18h.01" />
                                        </svg>
                                        Selected Courses
                                    </button>
                                </div>
                                <div className="pt-1">
                                    <button
                                        onClick={() => setShowDownloadModal(false)}
                                        className="w-full rounded-2xl bg-white px-6 py-3.5 text-center text-[16px] font-black text-[#6b6257] shadow-[0_8px_20px_rgba(74,54,30,0.05)] transition-colors hover:bg-[#f6ead8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A0C4FF]/60"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* Share Modal */}
            {showShareModal && (
                <div className="fixed inset-0 z-120 flex items-center justify-center bg-black/35 px-4 backdrop-blur-sm" onClick={() => setShowShareModal(false)}>
                    <div
                        className="relative w-full max-w-118 animate-[scaleIn_0.2s_ease] overflow-hidden rounded-[30px] border border-[#eadcc5] bg-[#FFF8E7] p-7 shadow-[0_24px_70px_rgba(74,54,30,0.18)] sm:p-8"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="mb-4! flex items-start gap-4">
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#A0C4FF]/65 text-black shadow-[0_10px_22px_rgba(160,196,255,0.28)]">
                                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                                </svg>
                            </div>
                            <div>
                                <h2 className="text-[24px] font-black leading-tight text-black">Share Timetable</h2>
                                <p className="mt-1 text-[14px] font-medium leading-relaxed text-[#6b6257]">Copy the link or send it directly to your friends.</p>
                            </div>
                        </div>

                        <div className="mb-1! rounded-2xl border border-[#eadcc5] bg-white p-2.5 shadow-[0_8px_24px_rgba(74,54,30,0.05)]">
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={shareUrl}
                                    readOnly
                                    className="min-w-0 flex-1 rounded-xl bg-[#F8E8D2]/45 px-4 py-3 text-[13px] font-semibold text-[#1f2937] outline-none"
                                    aria-label="Share timetable link"
                                />
                                <button
                                    onClick={async () => {
                                        const copied = await copyToClipboard(shareUrl);
                                        if (copied) showToast('Share link copied!');
                                    }}
                                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#A0C4FF] text-black transition-all hover:bg-[#8ab2f2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A0C4FF]/70 active:scale-95"
                                    title="Copy to clipboard"
                                >
                                    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                    </svg>
                                </button>
                            </div>
                        </div>

                        <div className="mb-4! grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <a
                                href={whatsappShareUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex min-h-13 items-center justify-center gap-2 rounded-2xl border border-[#bfead0] bg-[#C8F7DC] px-4 py-3 text-[15px] font-semibold text-black transition-all hover:bg-[#b0eac8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8F7DC] active:scale-[0.98]"
                            >
                                <svg width="22" height="22" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                                    <path fillRule="evenodd" clipRule="evenodd" d="M16 31C23.732 31 30 24.732 30 17C30 9.26801 23.732 3 16 3C8.26801 3 2 9.26801 2 17C2 19.5109 2.661 21.8674 3.81847 23.905L2 31L9.31486 29.3038C11.3014 30.3854 13.5789 31 16 31ZM16 28.8462C22.5425 28.8462 27.8462 23.5425 27.8462 17C27.8462 10.4576 22.5425 5.15385 16 5.15385C9.45755 5.15385 4.15385 10.4576 4.15385 17C4.15385 19.5261 4.9445 21.8675 6.29184 23.7902L5.23077 27.7692L9.27993 26.7569C11.1894 28.0746 13.5046 28.8462 16 28.8462Z" fill="#BFC8D0" />
                                    <path d="M28 16C28 22.6274 22.6274 28 16 28C13.4722 28 11.1269 27.2184 9.19266 25.8837L5.09091 26.9091L6.16576 22.8784C4.80092 20.9307 4 18.5589 4 16C4 9.37258 9.37258 4 16 4C22.6274 4 28 9.37258 28 16Z" fill="url(#whatsapp-share-gradient)" />
                                    <path fillRule="evenodd" clipRule="evenodd" d="M16 30C23.732 30 30 23.732 30 16C30 8.26801 23.732 2 16 2C8.26801 2 2 8.26801 2 16C2 18.5109 2.661 20.8674 3.81847 22.905L2 30L9.31486 28.3038C11.3014 29.3854 13.5789 30 16 30ZM16 27.8462C22.5425 27.8462 27.8462 22.5425 27.8462 16C27.8462 9.45755 22.5425 4.15385 16 4.15385C9.45755 4.15385 4.15385 9.45755 4.15385 16C4.15385 18.5261 4.9445 20.8675 6.29184 22.7902L5.23077 26.7692L9.27993 25.7569C11.1894 27.0746 13.5046 27.8462 16 27.8462Z" fill="white" />
                                    <path d="M12.5 9.49989C12.1672 8.83131 11.6565 8.8905 11.1407 8.8905C10.2188 8.8905 8.78125 9.99478 8.78125 12.05C8.78125 13.7343 9.52345 15.578 12.0244 18.3361C14.438 20.9979 17.6094 22.3748 20.2422 22.3279C22.875 22.2811 23.4167 20.0154 23.4167 19.2503C23.4167 18.9112 23.2062 18.742 23.0613 18.696C22.1641 18.2654 20.5093 17.4631 20.1328 17.3124C19.7563 17.1617 19.5597 17.3656 19.4375 17.4765C19.0961 17.8018 18.4193 18.7608 18.1875 18.9765C17.9558 19.1922 17.6103 19.083 17.4665 19.0015C16.9374 18.7892 15.5029 18.1511 14.3595 17.0426C12.9453 15.6718 12.8623 15.2001 12.5959 14.7803C12.3828 14.4444 12.5392 14.2384 12.6172 14.1483C12.9219 13.7968 13.3426 13.254 13.5313 12.9843C13.7199 12.7145 13.5702 12.305 13.4803 12.05C13.0938 10.953 12.7663 10.0347 12.5 9.49989Z" fill="white" />
                                    <defs>
                                        <linearGradient id="whatsapp-share-gradient" x1="26.5" y1="7" x2="4" y2="28" gradientUnits="userSpaceOnUse">
                                            <stop stopColor="#5BD066" />
                                            <stop offset="1" stopColor="#27B43E" />
                                        </linearGradient>
                                    </defs>
                                </svg>
                                WhatsApp
                            </a>
                            <a
                                href={telegramShareUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex min-h-13 items-center justify-center gap-2 rounded-2xl border border-[#d8e5fb] bg-[#A0C4FF] px-4 py-3 text-[15px] font-semibold text-black transition-all hover:bg-[#8fb6f2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A0C4FF]/70 active:scale-[0.98]"
                            >
                                <svg width="22" height="22" viewBox="0 0 256 256" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid" aria-hidden="true">
                                    <path d="M128 0C57.307 0 0 57.307 0 128C0 198.693 57.307 256 128 256C198.693 256 256 198.693 256 128C256 57.307 198.693 0 128 0Z" fill="#40B3E0" />
                                    <path d="M190.2826 73.6308L167.4206 188.8978C167.4206 188.8978 164.2236 196.8918 155.4306 193.0548L102.6726 152.6068L83.4886 143.3348L51.1946 132.4628C51.1946 132.4628 46.2386 130.7048 45.7586 126.8678C45.2796 123.0308 51.3546 120.9528 51.3546 120.9528L179.7306 70.5928C179.7306 70.5928 190.2826 65.9568 190.2826 73.6308Z" fill="#FFFFFF" />
                                    <path d="M98.6178 187.6035C98.6178 187.6035 97.0778 187.4595 95.1588 181.3835C93.2408 175.3085 83.4888 143.3345 83.4888 143.3345L161.0258 94.0945C161.0258 94.0945 165.5028 91.3765 165.3428 94.0945C165.3428 94.0945 166.1418 94.5735 163.7438 96.8115C161.3458 99.0505 102.8328 151.6475 102.8328 151.6475" fill="#D2E5F1" />
                                    <path d="M122.9015 168.1154L102.0335 187.1414C102.0335 187.1414 100.4025 188.3794 98.6175 187.6034L102.6135 152.2624" fill="#B5CFE4" />
                                </svg>
                                Telegram
                            </a>
                        </div>

                        <div className="pt-1">
                            <button
                                onClick={() => setShowShareModal(false)}
                                className="w-full rounded-2xl bg-white px-6 py-3.5 text-center text-[16px] font-black text-[#6b6257] shadow-[0_8px_20px_rgba(74,54,30,0.05)] transition-colors hover:bg-[#f6ead8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A0C4FF]/60"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Save Modal */}
            {showSaveModal && (
                <div className="fixed inset-0 z-120 flex items-center justify-center bg-black/35 px-4 backdrop-blur-sm" onClick={() => {
                    setSaveError('');
                    setShowSaveModal(false);
                }}>
                    <div
                        className="relative w-full max-w-118 animate-[scaleIn_0.2s_ease] overflow-hidden rounded-[30px] border border-[#eadcc5] bg-[#FFF8E7] p-7 shadow-[0_24px_70px_rgba(74,54,30,0.18)] sm:p-8"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="mb-4! flex items-start gap-4">
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#F9A8D4]/60 text-black shadow-[0_10px_22px_rgba(249,168,212,0.24)]">
                                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                                    <path d="M17 21v-8H7v8" />
                                    <path d="M7 3v5h8" />
                                </svg>
                            </div>
                            <div>
                                <h2 className="text-[24px] font-black leading-tight text-black">Save Timetable</h2>
                                <p className="mt-1 text-[14px] font-medium leading-relaxed text-[#6b6257]">Give this schedule a name before saving it.</p>
                            </div>
                        </div>

                        {/* Save options (Update existing or Save as copy) */}
                        {isEditing && (
                            <div className="mb-4! flex gap-4">
                                <button
                                    type="button"
                                    onClick={() => setSaveOption('update')}
                                    className={`relative flex-1 p-4 rounded-2xl border text-center transition-all duration-200 cursor-pointer ${
                                        saveOption === 'update'
                                            ? 'border-[#A0C4FF] bg-white text-black shadow-[0_8px_20px_rgba(160,196,255,0.12)] scale-[1.02]'
                                            : 'border-[#eadcc5] bg-[#FFF8E7]/40 text-[#6b6257] hover:bg-[#f6ead8] opacity-80 hover:opacity-100'
                                    }`}
                                >
                                    {saveOption === 'update' && (
                                        <div className="absolute top-2 right-2 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-[#A0C4FF] text-black">
                                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                                                <polyline points="20 6 9 17 4 12" />
                                            </svg>
                                        </div>
                                    )}
                                    <div className={`text-[14px] ${saveOption === 'update' ? 'font-extrabold text-[#1a1a1a]' : 'font-bold'}`}>Update Existing</div>
                                    <div className="text-[11px] font-semibold opacity-75 mt-0.5">Overwrite current</div>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setSaveOption('new')}
                                    className={`relative flex-1 p-4 rounded-2xl border text-center transition-all duration-200 cursor-pointer ${
                                        saveOption === 'new'
                                            ? 'border-[#A0C4FF] bg-white text-black shadow-[0_8px_20px_rgba(160,196,255,0.12)] scale-[1.02]'
                                            : 'border-[#eadcc5] bg-[#FFF8E7]/40 text-[#6b6257] hover:bg-[#f6ead8] opacity-80 hover:opacity-100'
                                    }`}
                                >
                                    {saveOption === 'new' && (
                                        <div className="absolute top-2 right-2 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-[#A0C4FF] text-black">
                                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                                                <polyline points="20 6 9 17 4 12" />
                                            </svg>
                                        </div>
                                    )}
                                    <div className={`text-[14px] ${saveOption === 'new' ? 'font-extrabold text-[#1a1a1a]' : 'font-bold'}`}>Save as Copy</div>
                                    <div className="text-[11px] font-semibold opacity-75 mt-0.5">Create new record</div>
                                </button>
                            </div>
                        )}

                        <div className="mb-4! rounded-2xl border border-[#eadcc5] bg-white px-5 py-4 shadow-[0_4px_16px_rgba(74,54,30,0.02)] focus-within:border-[#A0C4FF] focus-within:ring-2 focus-within:ring-[#A0C4FF]/30 transition-all">
                            <input
                                type="text"
                                value={timetableTitle}
                                onChange={(e) => {
                                    setTimetableTitle(e.target.value);
                                    if (saveError) {
                                        setSaveError('');
                                    }
                                }}
                                className="w-full bg-transparent text-[16px] font-semibold text-black outline-none border-none p-0 focus:ring-0 focus:outline-none placeholder:font-medium placeholder:text-[#8a8177]"
                                placeholder="Enter a title..."
                                autoFocus
                            />
                        </div>
                        {saveError && (
                            <p className="mb-6 rounded-2xl border border-[#fecdd3] bg-[#fff1f2] px-4 py-3 text-[14px] font-semibold text-[#b42318]">
                                {saveError}
                            </p>
                        )}
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <button
                                onClick={() => {
                                    setSaveError('');
                                    setShowSaveModal(false);
                                }}
                                className="min-h-13 rounded-2xl bg-white px-6 py-3.5 text-center text-[16px] font-black text-[#6b6257] shadow-[0_8px_20px_rgba(74,54,30,0.05)] transition-colors hover:bg-[#f6ead8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A0C4FF]/60"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => {
                                    handleSave(timetableTitle, { saveAsNew: saveOption === 'new' });
                                }}
                                disabled={isSaving || !timetableTitle.trim()}
                                className="min-h-13 rounded-2xl bg-[#A0C4FF] px-6 py-3.5 text-center text-[16px] font-black text-black shadow-[0_8px_20px_rgba(160,196,255,0.32)] transition-all hover:bg-[#8eb1ef] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A0C4FF]/70 active:scale-[0.98] disabled:opacity-50"
                            >
                                {isSaving ? 'Saving...' : (isEditing && saveOption === 'update' ? 'Update' : (isEditing ? 'Save Copy' : 'Save'))}
                            </button>
                        </div>
                    </div>
                </div>
            )}


            {showLogin && (
                <LoginModal
                    onClose={() => setShowLogin(false)}
                    callbackUrl={typeof window !== 'undefined' ? window.location.href : '/timetable'}
                />
            )}
        </div>
    );
}
