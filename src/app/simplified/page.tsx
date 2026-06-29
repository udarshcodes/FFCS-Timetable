'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useSession, signOut } from 'next-auth/react';
import posthog from 'posthog-js';
import { useFeatureFlagEnabled } from '@posthog/react';
import axios from 'axios';
import type { AxiosError } from 'axios';

import { FEATURE_FLAGS } from '@/lib/featureFlags';
import { useTimetable } from '@/lib/TimeTableContext';
import { usePreferences } from '@/lib/PreferencesContext';
import ModeHelpDialog from '@/components/ModeHelpDialog';
import { getPlannerStoredValue, setPlannerStoredValue } from '@/lib/plannerStorage';
import { generateTT, parseName } from '@/lib/utils';
import { clearPlannerClientCache } from '@/lib/clientCache';
import LoginModal from '@/components/loginPopup';
import SmallFooter from '@/components/SmallFooter';
import { getSlotViewPayload } from '@/lib/slot-view';
import { clashMap, findMatchingLabSlot, pairTheoryAndLabSlots } from '@/lib/slots';
import { isTheoryType, isLabType, getCourseCredits } from '@/lib/chennaiCatalog';
import chennaiCourses from '@/data/all_data_chennai';
import { fullCourseData, timetableDisplayData } from '@/lib/type';
import { exportToPDF } from '@/lib/exportToPDF';
import { getShortCourseName } from '@/lib/courseDisplay';

/* ── Venue lookup from raw data ── */
const _venueIndex = new Map<string, string>();
chennaiCourses.forEach((r) => {
    if ((r as any).VENUE) _venueIndex.set(`${r.CODE}|${r.SLOT}|${r.FACULTY}`, (r as any).VENUE);
});
function lookupVenue(courseCode: string, slot: string, facultyName: string): string {
    const key = `${courseCode}|${slot}|${facultyName}`;
    if (_venueIndex.has(key)) return _venueIndex.get(key)!;
    const firstSlot = slot.split('+')[0]?.trim();
    const partialKey = `${courseCode}|${firstSlot}|${facultyName}`;
    return _venueIndex.get(partialKey) || 'TBD';
}

// Types
type FacultyEntry = {
    uid: string;
    no: number;
    courseCode: string;
    courseName: string;
    slot: string;
    facultyName: string;
    venue?: string;
};

type CourseOption = {
    id: string;
    courseCode: string;
    courseName: string;
    facultyName: string;
    theorySlot?: string;
    labSlot?: string;
    credits: number;
    type: 'th' | 'lab' | 'both';
    venue?: string;
    venueLab?: string;
};

type HighlightedCell = {
    rect: { top: number; left: number; width: number; height: number };
    label: string;
    courseCode: string;
    backgroundColor: string;
};

type SlotCategory = 'theory' | 'lab';

const THEORY_FILLED_COLOR = '#BFF0C8';
const THEORY_EMPTY_COLOR = '#E1F9E9';
const LAB_FILLED_COLOR = '#FFE78A';
const LAB_EMPTY_COLOR = '#FFF2BF';
const THEORY_POPUP_COLOR = '#CFF3D5';
const THEORY_POPUP_BORDER = '#6AA874';
const LAB_POPUP_COLOR = '#FFF0A6';
const LAB_POPUP_BORDER = '#8F8443';

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

function isSameSlot(a: timetableDisplayData | null, b: timetableDisplayData | null) {
    if (!a || !b) return false;
    return (
        a.courseCode === b.courseCode &&
        a.courseName === b.courseName &&
        a.slotName === b.slotName &&
        a.facultyName === b.facultyName
    );
}

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
                    <th className={`text-center font-bold text-black border-r-2 border-white bg-white ${exportMode ? 'w-37.5 p-3 text-[20px] leading-tight' : 'w-15 md:w-[5vw] p-0.5 text-[9px] leading-tight'}`}>Lab Hours</th>
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

const ALL_SUBJECTS_MODE_HELP = [
    {
        title: 'All Subjects Mode - ON',
        description: 'Generated timetables strictly include all of the selected subjects.',
    },
    {
        title: 'All Subjects Mode - OFF',
        description: 'You can toggle off checkboxes for specific subjects to quickly preview how your timetable looks without them, instead of deleting them entirely.',
    },
];

// Check if two slots clash
const doSlotsClash = (slot1: string, slot2: string): boolean => {
    const slots1 = slot1.split('+').map(s => s.trim());
    const slots2 = slot2.split('+').map(s => s.trim());

    for (const s1 of slots1) {
        for (const s2 of slots2) {
            if (s1 === s2) return true;
            if (clashMap[s1]?.includes(s2)) return true;
            if (clashMap[s2]?.includes(s1)) return true;
        }
    }
    return false;
};

// Help helper
const isLabSlotName = (slot: string): boolean => slot.trim().toUpperCase().startsWith('L');

// Mapper: selected CourseOptions to FacultyEntry[]
const optionsToFacultyEntries = (selectedOptions: CourseOption[]): FacultyEntry[] => {
    const entries: FacultyEntry[] = [];
    selectedOptions.forEach((opt) => {
        if (opt.theorySlot) {
            entries.push({
                uid: `${opt.id}_theory`,
                no: entries.length + 1,
                courseCode: opt.courseCode,
                courseName: opt.courseName,
                slot: opt.theorySlot,
                facultyName: opt.facultyName,
                venue: opt.venue || 'TBD'
            });
        }
        if (opt.labSlot) {
            entries.push({
                uid: `${opt.id}_lab`,
                no: entries.length + 1,
                courseCode: opt.courseCode,
                courseName: opt.courseName,
                slot: opt.labSlot,
                facultyName: opt.facultyName,
                venue: opt.venueLab || 'TBD'
            });
        }
    });
    return entries;
};

// Mapper: FacultyEntry[] to fullCourseData[]
const buildPreferenceCoursesFromRows = (rows: FacultyEntry[]): fullCourseData[] => {
    const coursesMap = new Map<string, {
        courseCode: string;
        courseName: string;
        facultySlots: Map<string, { theorySlots: string[]; labSlots: string[]; venues: Map<string, string> }>;
    }>();

    rows.forEach(row => {
        if (!coursesMap.has(row.courseCode)) {
            coursesMap.set(row.courseCode, {
                courseCode: row.courseCode,
                courseName: row.courseName,
                facultySlots: new Map(),
            });
        }

        const courseGroup = coursesMap.get(row.courseCode)!;

        if (!courseGroup.facultySlots.has(row.facultyName)) {
            courseGroup.facultySlots.set(row.facultyName, { theorySlots: [], labSlots: [], venues: new Map() });
        }

        const fs = courseGroup.facultySlots.get(row.facultyName)!;
        if (isLabSlotName(row.slot)) {
            if (!fs.labSlots.includes(row.slot)) fs.labSlots.push(row.slot);
        } else {
            if (!fs.theorySlots.includes(row.slot)) fs.theorySlots.push(row.slot);
        }
        if (row.venue) {
            fs.venues.set(row.slot, row.venue);
        }
    });

    const result: fullCourseData[] = [];

    coursesMap.forEach((course) => {
        let hasTheory = false;
        let hasLab = false;
        course.facultySlots.forEach(({ theorySlots, labSlots }) => {
            if (theorySlots.length > 0) hasTheory = true;
            if (labSlots.length > 0) hasLab = true;
        });

        let courseType: 'th' | 'lab' | 'both';
        if (hasTheory && hasLab) courseType = 'both';
        else if (hasLab) courseType = 'lab';
        else courseType = 'th';

        if (courseType === 'both') {
            const theorySlotMap = new Map<string, { facultyName: string; facultyLabSlot?: string; venue?: string; venueLab?: string }[]>();

            course.facultySlots.forEach(({ theorySlots, labSlots, venues }, facultyName) => {
                const pairings = pairTheoryAndLabSlots(theorySlots, labSlots);
                theorySlots.forEach(theorySlot => {
                    const labSlot = pairings.get(theorySlot);
                    if (!theorySlotMap.has(theorySlot)) theorySlotMap.set(theorySlot, []);
                    theorySlotMap.get(theorySlot)!.push({
                        facultyName,
                        ...(labSlot ? { facultyLabSlot: labSlot } : {}),
                        venue: venues.get(theorySlot) || 'TBD',
                        ...(labSlot ? { venueLab: venues.get(labSlot) || 'TBD' } : {}),
                    });
                });
                if (theorySlots.length === 0) {
                    labSlots.forEach(labSlot => {
                        if (!theorySlotMap.has(labSlot)) theorySlotMap.set(labSlot, []);
                        theorySlotMap.get(labSlot)!.push({
                            facultyName,
                            venue: venues.get(labSlot) || 'TBD',
                        });
                    });
                }
            });

            result.push({
                id: `${course.courseCode}_${Date.now()}_${Math.random().toString(36).slice(2)}`,
                courseType: 'both',
                courseCode: course.courseCode,
                courseName: course.courseName,
                courseCodeLab: course.courseCode,
                courseNameLab: course.courseName,
                courseSlots: Array.from(theorySlotMap.entries()).map(([slotName, faculties]) => ({
                    slotName,
                    slotFaculties: faculties,
                })),
            });
        } else {
            const slotMap = new Map<string, { facultyName: string; venue?: string }[]>();
            course.facultySlots.forEach(({ theorySlots, labSlots, venues }, facultyName) => {
                const slots = courseType === 'lab' ? labSlots : theorySlots;
                slots.forEach(slot => {
                    if (!slotMap.has(slot)) slotMap.set(slot, []);
                    slotMap.get(slot)!.push({
                        facultyName,
                        venue: venues.get(slot) || 'TBD',
                    });
                });
            });

            result.push({
                id: `${course.courseCode}_${Date.now()}_${Math.random().toString(36).slice(2)}`,
                courseType,
                courseCode: course.courseCode,
                courseName: course.courseName,
                courseSlots: Array.from(slotMap.entries()).map(([slotName, faculties]) => ({
                    slotName,
                    slotFaculties: faculties,
                })),
            });
        }
    });

    return result;
};

export default function CourseSelectionPage() {
    const router = useRouter();
    const { data: session } = useSession();
    const { timetableData, setTimetableData } = useTimetable();
    const { selectedScheme, setSelectedScheme } = usePreferences();
    
    // Feature Flag check
    const isSimplifiedEnabled = useFeatureFlagEnabled(FEATURE_FLAGS.simplifiedFlow);

    // Local selections
    const [selectedOptions, setSelectedOptions] = useState<CourseOption[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [activeCourseCode, setActiveCourseCode] = useState<string | null>(null);
    const [pendingOption, setPendingOption] = useState<CourseOption | null>(null);
    const [teacherSearchTerm, setTeacherSearchTerm] = useState('');
    const [focusedIndex, setFocusedIndex] = useState<number>(-1);
    const [showDropdown, setShowDropdown] = useState(false);
    const searchContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
                setShowDropdown(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    // Reset teacher search term when active course switches
    useEffect(() => {
        setTeacherSearchTerm('');
        if (activeCourseCode) {
            const confirmed = selectedOptions.find(o => o.courseCode === activeCourseCode);
            setPendingOption(confirmed || null);
        } else {
            setPendingOption(null);
        }
    }, [activeCourseCode, selectedOptions]);

    const [loaded, setLoaded] = useState(false);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [showUserMenu, setShowUserMenu] = useState(false);
    const [showLogin, setShowLogin] = useState(false);
    const [navigatingTo, setNavigatingTo] = useState<string | null>(null);

    const navigateWithLoader = (path: string, label: string) => {
        setNavigatingTo(label);
        setTimeout(() => router.push(path), 250);
    };

    const handleLogout = React.useCallback(() => {
        clearPlannerClientCache({ includeEditingState: true });
        signOut({ callbackUrl: '/' });
    }, []);

    const [allSubjectsMode, setAllSubjectsMode] = useState(false);
    const [disabledOptions, setDisabledOptions] = useState<Set<string>>(new Set());
    const [isHelpOpen, setIsHelpOpen] = useState(false);
    const [undoStack, setUndoStack] = useState<CourseOption[][]>([]);

    const { scheduleRows, leftTimes, rightTimes } = useMemo(() => getSlotViewPayload(), []);

    // Full timetable states
    const [selectedSlot, setSelectedSlot] = useState<timetableDisplayData | null>(null);
    const [highlightedCells, setHighlightedCells] = useState<HighlightedCell[]>([]);
    const [selectedSlotCategory, setSelectedSlotCategory] = useState<SlotCategory | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [toast, setToast] = useState('');
    const [toastType, setToastType] = useState<'success' | 'error'>('success');
    const [showSaveModal, setShowSaveModal] = useState(false);
    const [showDownloadModal, setShowDownloadModal] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);
    const [showShareModal, setShowShareModal] = useState(false);
    const [shareUrl, setShareUrl] = useState('');
    const [timetableTitle, setTimetableTitle] = useState('My Schedule');
    const [saveError, setSaveError] = useState('');

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

    const handleSave = async (customTitle?: string, options?: { skipRedirect?: boolean; makePublic?: boolean }) => {
        if (!session?.user?.email) {
            setShowLogin(true);
            showToast('Please sign in to save or share your timetable.');
            return null;
        }
        if (isSaving || currentCombination.length === 0) return null;

        setSaveError('');
        setIsSaving(true);
        try {
            const editingTimetableId = getCookie('editingTimetableId');
            const title = customTitle?.trim() || timetableTitle.trim() || 'My Schedule';

            const slotsData = currentCombination.map(s => ({
                slot: s.slotName,
                courseCode: s.courseCode,
                courseName: s.courseName,
                facultyName: s.facultyName,
                venue: s.venue || 'TBD',
            }));

            if (editingTimetableId) {
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
                        const timeoutId = setTimeout(() => {
    // existing code here
    return () => clearTimeout(timeoutId);
} router.refresh(); router.push('/saved'); }, 1200);
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
        console.log('handleDownload called', { currentCombinationLength: currentCombination.length });
        if (currentCombination.length === 0) {
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
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            try {
                await navigator.clipboard.writeText(text);
                return true;
            } catch {
                // Fall through to fallback
            }
        }
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
        if (currentCombination.length === 0) {
            showToast('No timetable data to share.', 'error');
            return;
        }

        try {
            console.log('Starting share flow...');
            const editingTimetableId = getCookie('editingTimetableId');
            let shareId: string | null = null;

            if (editingTimetableId) {
                console.log('Editing existing timetable:', editingTimetableId);
                const slotsData = currentCombination.map(s => ({
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
                const saved = await handleSave(timetableTitle, { skipRedirect: true, makePublic: true });
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
                slots_count: currentCombination.length,
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

    // Set scheme default
    useEffect(() => {
        if (!selectedScheme) {
            setSelectedScheme('CHENNAI');
        }
    }, [selectedScheme, setSelectedScheme]);

    // Load initial selections on mount
    useEffect(() => {
        const savedCoursesRaw = getPlannerStoredValue('preferenceCourses') || getPlannerStoredValue('generatedTimetableCourses');
        if (savedCoursesRaw) {
            try {
                const storedCourses = JSON.parse(savedCoursesRaw) as fullCourseData[];
                const loadedOptions: CourseOption[] = [];
                
                storedCourses.forEach(course => {
                    course.courseSlots.forEach(slot => {
                        slot.slotFaculties.forEach(fac => {
                            const tr = (chennaiCourses as any).find((r: any) => r.CODE === course.courseCode && r.SLOT === slot.slotName && r.FACULTY === fac.facultyName);
                            const lr = fac.facultyLabSlot ? (chennaiCourses as any).find((r: any) => r.CODE === course.courseCode && r.SLOT === fac.facultyLabSlot && r.FACULTY === fac.facultyName) : undefined;
                            
                            const type: 'th' | 'lab' | 'both' = (tr && lr) ? 'both' : lr ? 'lab' : 'th';
                            const credits = (tr?.CREDITS || 0) + (lr?.CREDITS || 0);

                            loadedOptions.push({
                                id: `${course.courseCode}_${fac.facultyName}_${slot.slotName}_${fac.facultyLabSlot || 'none'}`,
                                courseCode: course.courseCode,
                                courseName: course.courseName,
                                facultyName: fac.facultyName,
                                theorySlot: tr ? slot.slotName : undefined,
                                labSlot: fac.facultyLabSlot || undefined,
                                credits,
                                type,
                                venue: fac.venue || 'TBD',
                                venueLab: fac.venueLab || 'TBD',
                            });
                        });
                    });
                });

                setSelectedOptions(loadedOptions);
            } catch (err) {
                console.error("Failed to parse initial selections", err);
            }
        }
        setLoaded(true);
    }, []);

    // Synchronize to storage on change
    useEffect(() => {
        if (!loaded) return;

        const activeOptions = allSubjectsMode ? selectedOptions : selectedOptions.filter(opt => !disabledOptions.has(opt.id));
        const faculties = optionsToFacultyEntries(activeOptions);
        const facultyNames = faculties.map(f => f.facultyName);
        
        setPlannerStoredValue('preferenceMultipleFaculties', JSON.stringify(facultyNames));
        
        const updatedCourses = buildPreferenceCoursesFromRows(faculties);
        setPlannerStoredValue('preferenceCourses', JSON.stringify(updatedCourses));
        setPlannerStoredValue('generatedTimetableCourses', JSON.stringify(updatedCourses));
        
        // Regenerate timetable context
        const { result } = generateTT(updatedCourses);
        setTimetableData(result);
        setCurrentIndex(0); // Reset combination index
    }, [selectedOptions, disabledOptions, allSubjectsMode, loaded, setTimetableData]);

    // Unique courses list for search autocomplete
    const uniqueCourses = useMemo(() => {
        const map = new Map<string, { code: string; title: string }>();
        (chennaiCourses as any).forEach((record: any) => {
            if (!map.has(record.CODE)) {
                map.set(record.CODE, { code: record.CODE, title: record.TITLE });
            }
        });
        return Array.from(map.values());
    }, []);

    // Filtered search results
    const searchResults = useMemo(() => {
        if (!searchTerm.trim()) return [];
        const query = searchTerm.toLowerCase();
        return uniqueCourses.filter(
            (c) => c.code.toLowerCase().includes(query) || c.title.toLowerCase().includes(query)
        ).slice(0, 8); // limit for overlay layout
    }, [uniqueCourses, searchTerm]);

    // Precompute the count of unique faculties for each course code
    const courseFacultyCounts = useMemo(() => {
        const counts = new Map<string, number>();
        const facultiesMap = new Map<string, Set<string>>();
        (chennaiCourses as any).forEach((record: any) => {
            if (!facultiesMap.has(record.CODE)) {
                facultiesMap.set(record.CODE, new Set<string>());
            }
            if (record.FACULTY) {
                facultiesMap.get(record.CODE)!.add(record.FACULTY.trim());
            }
        });
        facultiesMap.forEach((faculties, code) => {
            counts.set(code, faculties.size);
        });
        return counts;
    }, []);

    // Helper to highlight matching text in search results
    const highlightMatch = useCallback((text: string, query: string) => {
        if (!query.trim()) return text;
        const escapedQuery = query.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const parts = text.split(new RegExp(`(${escapedQuery})`, 'gi'));
        return (
            <>
                {parts.map((part, index) => 
                    part.toLowerCase() === query.toLowerCase() ? (
                        <mark key={index} className="bg-[#FFE78A] text-black font-extrabold rounded px-0.5">{part}</mark>
                    ) : (
                        part
                    )
                )}
            </>
        );
    }, []);

    // Handle search keydown events (ArrowUp, ArrowDown, Enter, Escape)
    const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
        if (searchResults.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setShowDropdown(true);
            setFocusedIndex(prev => (prev + 1) % searchResults.length);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setShowDropdown(true);
            setFocusedIndex(prev => (prev - 1 + searchResults.length) % searchResults.length);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            const selectedIndex = focusedIndex >= 0 ? focusedIndex : 0;
            const target = searchResults[selectedIndex];
            if (target) {
                setActiveCourseCode(target.code);
                setSearchTerm(`${target.code} - ${target.title}`);
                setShowDropdown(false);
                setFocusedIndex(-1);
            }
        } else if (e.key === 'Escape') {
            setShowDropdown(false);
            setFocusedIndex(-1);
        }
    }, [searchResults, focusedIndex]);

    // Active course records
    const activeCourseRecords = useMemo(() => {
        if (!activeCourseCode) return [];
        const records = (chennaiCourses as any).filter((record: any) => record.CODE === activeCourseCode);
        
        // De-duplicate by FACULTY + SLOT + TYPE
        const seen = new Set<string>();
        const unique: any[] = [];
        records.forEach((r: any) => {
            const key = `${r.FACULTY?.trim()}|${r.SLOT?.trim()}|${r.TYPE?.trim()}`;
            if (!seen.has(key)) {
                seen.add(key);
                unique.push(r);
            }
        });
        return unique;
    }, [activeCourseCode]);

    // Active course name
    const activeCourseName = useMemo(() => {
        if (!activeCourseCode) return '';
        return activeCourseRecords[0]?.TITLE || '';
    }, [activeCourseCode, activeCourseRecords]);

    // Group active course records by faculty/slot into options
    const activeCourseOptions = useMemo(() => {
        if (activeCourseRecords.length === 0) return [];
        
        const facultyMap = new Map<string, any[]>();
        activeCourseRecords.forEach((r: any) => {
            if (!facultyMap.has(r.FACULTY)) {
                facultyMap.set(r.FACULTY, []);
            }
            facultyMap.get(r.FACULTY)!.push(r);
        });

        const options: CourseOption[] = [];

        facultyMap.forEach((facRecords, facultyName) => {
            const theoryRecords = facRecords.filter((r: any) => isTheoryType(r.TYPE));
            const labRecords = facRecords.filter((r: any) => isLabType(r.TYPE));

            if (theoryRecords.length > 0 && labRecords.length > 0) {
                const theorySlots = theoryRecords.map((tr: any) => tr.SLOT);
                const labSlots = labRecords.map((lr: any) => lr.SLOT);
                const pairings = pairTheoryAndLabSlots(theorySlots, labSlots);
                const pairedLabSlots = new Set<string>();

                theoryRecords.forEach((tr: any) => {
                    const matchedLabSlotName = pairings.get(tr.SLOT);
                    const matchingLabRecord = matchedLabSlotName 
                        ? labRecords.find((lr: any) => lr.SLOT === matchedLabSlotName)
                        : undefined;

                    if (matchingLabRecord) {
                        pairedLabSlots.add(matchingLabRecord.SLOT);
                        options.push({
                            id: `${tr.CODE}_${facultyName}_${tr.SLOT}_${matchingLabRecord.SLOT}`,
                            courseCode: tr.CODE,
                            courseName: tr.TITLE,
                            facultyName,
                            theorySlot: tr.SLOT,
                            labSlot: matchingLabRecord.SLOT,
                            type: 'both',
                            credits: tr.CREDITS + matchingLabRecord.CREDITS,
                            venue: tr.VENUE || 'TBD',
                            venueLab: matchingLabRecord.VENUE || 'TBD',
                        });
                    } else {
                        options.push({
                            id: `${tr.CODE}_${facultyName}_${tr.SLOT}_none`,
                            courseCode: tr.CODE,
                            courseName: tr.TITLE,
                            facultyName,
                            theorySlot: tr.SLOT,
                            type: 'th',
                            credits: tr.CREDITS,
                            venue: tr.VENUE || 'TBD',
                        });
                    }
                });

                labRecords.forEach((lr: any) => {
                    if (!pairedLabSlots.has(lr.SLOT)) {
                        options.push({
                            id: `${lr.CODE}_${facultyName}_none_${lr.SLOT}`,
                            courseCode: lr.CODE,
                            courseName: lr.TITLE,
                            facultyName,
                            labSlot: lr.SLOT,
                            type: 'lab',
                            credits: lr.CREDITS,
                            venueLab: lr.VENUE || 'TBD',
                        });
                    }
                });
            } else if (theoryRecords.length > 0) {
                theoryRecords.forEach((tr: any) => {
                    options.push({
                        id: `${tr.CODE}_${facultyName}_${tr.SLOT}_none`,
                        courseCode: tr.CODE,
                        courseName: tr.TITLE,
                        facultyName,
                        theorySlot: tr.SLOT,
                        type: 'th',
                        credits: tr.CREDITS,
                        venue: tr.VENUE || 'TBD',
                    });
                });
            } else if (labRecords.length > 0) {
                labRecords.forEach((lr: any) => {
                    options.push({
                        id: `${lr.CODE}_${facultyName}_none_${lr.SLOT}`,
                        courseCode: lr.CODE,
                        courseName: lr.TITLE,
                        facultyName,
                        labSlot: lr.SLOT,
                        type: 'lab',
                        credits: lr.CREDITS,
                        venueLab: lr.VENUE || 'TBD',
                    });
                });
            }
        });

        return options;
    }, [activeCourseRecords]);

    // Filter active course options based on teacherSearchTerm matching facultyName, theorySlot, or labSlot
    const filteredCourseOptions = useMemo(() => {
        if (!teacherSearchTerm.trim()) return activeCourseOptions;
        const query = teacherSearchTerm.toLowerCase().trim();
        return activeCourseOptions.filter((opt) => {
            const matchesName = opt.facultyName.toLowerCase().includes(query);
            const matchesTheory = opt.theorySlot ? opt.theorySlot.toLowerCase().includes(query) : false;
            const matchesLab = opt.labSlot ? opt.labSlot.toLowerCase().includes(query) : false;
            return matchesName || matchesTheory || matchesLab;
        });
    }, [activeCourseOptions, teacherSearchTerm]);

    // Dynamically calculate grid columns based on teacher options count
    const gridColsClass = useMemo(() => {
        const count = filteredCourseOptions.length;
        if (count <= 4) {
            return "grid-cols-1 sm:grid-cols-2";
        } else if (count <= 8) {
            return "grid-cols-1 sm:grid-cols-2 md:grid-cols-3";
        } else {
            return "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4";
        }
    }, [filteredCourseOptions.length]);

    // Live timetable generation combination details
    const currentCombination = useMemo(() => {
        return timetableData?.[currentIndex] || [];
    }, [timetableData, currentIndex]);

    const totalCombinations = useMemo(() => {
        return timetableData?.length || 0;
    }, [timetableData]);

    const selectedCourses = useMemo(() => {
        const courseMap = new Map<string, { courseName: string; facultyName: string; slots: string[]; venues: string[]; credits: number }>();
        currentCombination.forEach((slot) => {
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
    }, [currentCombination]);

    const exportCreditsLabel = useMemo(() => {
        return selectedCourses.reduce((sum, [, info]) => sum + info.credits, 0).toString();
    }, [selectedCourses]);

    // Grid details for visual table rendering
    const theoryGrid: (timetableDisplayData | null)[][] = Array.from({ length: 5 }, () => Array(13).fill(null));
    const labGrid: (timetableDisplayData | null)[][] = Array.from({ length: 5 }, () => Array(13).fill(null));

    currentCombination.forEach(s => {
        const parts = s.slotName.split(/\+|__/);
        parts.forEach(p => {
            const cleanP = p.trim();
            scheduleRows.forEach((row, dayIdx) => {
                row.theoryLeft.forEach((cell, colIdx) => { if (cell.key === cleanP) theoryGrid[dayIdx][colIdx] = s; });
                row.theoryRight.forEach((cell, colIdx) => { if (cell.key === cleanP) theoryGrid[dayIdx][colIdx + 7] = s; });
                row.labLeft.forEach((cell, colIdx) => { if (cell.key === cleanP) labGrid[dayIdx][colIdx] = s; });
                row.labRight.forEach((cell, colIdx) => { if (cell.key === cleanP) labGrid[dayIdx][colIdx + 7] = s; });
            });
        });
    });

    // Check if slot is active/selected
    const isOptionSelected = (optId: string) => {
        return selectedOptions.some(o => o.id === optId);
    };

    // Toggle option
    const handleToggleOption = (opt: CourseOption) => {
        setSelectedOptions(prev => {
            const exists = prev.some(o => o.id === opt.id);
            if (exists) {
                return prev.filter(o => o.id !== opt.id);
            } else {
                // Clear other selections for the same course code to prevent duplicate registrations
                const filtered = prev.filter(o => o.courseCode !== opt.courseCode);
                return [...filtered, opt];
            }
        });
    };

    // Remove course selection
    const handleRemoveCourse = (courseCode: string) => {
        setUndoStack(prev => [...prev, selectedOptions]);
        setSelectedOptions(prev => prev.filter(o => o.courseCode !== courseCode));
    };

    const handleUndo = () => {
        setUndoStack(prev => {
            if (prev.length === 0) return prev;
            const lastState = prev[prev.length - 1];
            setSelectedOptions(lastState);
            return prev.slice(0, -1);
        });
    };

    const handleMoveUp = (index: number) => {
        if (index <= 0) return;
        setSelectedOptions((prev) => {
            const newOptions = [...prev];
            [newOptions[index - 1], newOptions[index]] = [newOptions[index], newOptions[index - 1]];
            return newOptions;
        });
    };

    const handleMoveDown = (index: number) => {
        setSelectedOptions((prev) => {
            if (index >= prev.length - 1) return prev;
            const newOptions = [...prev];
            [newOptions[index], newOptions[index + 1]] = [newOptions[index + 1], newOptions[index]];
            return newOptions;
        });
    };

    // Total credits selected
    const totalCredits = useMemo(() => {
        const activeOptions = allSubjectsMode ? selectedOptions : selectedOptions.filter(opt => !disabledOptions.has(opt.id));
        const seenCourseCodes = new Set<string>();
        return activeOptions.reduce((acc, curr) => {
            if (seenCourseCodes.has(curr.courseCode)) {
                return acc;
            }
            seenCourseCodes.add(curr.courseCode);
            return acc + curr.credits;
        }, 0);
    }, [selectedOptions, disabledOptions, allSubjectsMode]);

    // Calculate clashes among active options
    const clashingIds = useMemo(() => {
        const activeOptions = allSubjectsMode ? selectedOptions : selectedOptions.filter(opt => !disabledOptions.has(opt.id));
        const clashes = new Set<string>();

        for (let i = 0; i < activeOptions.length; i++) {
            for (let j = i + 1; j < activeOptions.length; j++) {
                const optA = activeOptions[i];
                const optB = activeOptions[j];

                if (optA.courseCode === optB.courseCode) continue;

                let hasClash = false;
                if (optA.theorySlot && optB.theorySlot && doSlotsClash(optA.theorySlot, optB.theorySlot)) hasClash = true;
                else if (optA.labSlot && optB.labSlot && doSlotsClash(optA.labSlot, optB.labSlot)) hasClash = true;
                else if (optA.theorySlot && optB.labSlot && doSlotsClash(optA.theorySlot, optB.labSlot)) hasClash = true;
                else if (optA.labSlot && optB.theorySlot && doSlotsClash(optA.labSlot, optB.theorySlot)) hasClash = true;

                if (hasClash) {
                    clashes.add(optA.id);
                    clashes.add(optB.id);
                }
            }
        }
        return clashes;
    }, [selectedOptions, disabledOptions, allSubjectsMode]);

    const handleClearAll = () => {
        setUndoStack(prev => [...prev, selectedOptions]);
        setSelectedOptions([]);
        setActiveCourseCode(null);
        setSearchTerm('');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleProceedToSave = () => {
        posthog.capture('proceed_to_save_clicked', {
            selected_courses_count: selectedOptions.length,
            total_credits: totalCredits
        });
        router.push('/timetable');
    };

    // If flag is disabled and loaded, redirect back to preferences
    useEffect(() => {
        if (!isSimplifiedEnabled) {
            router.replace('/preferences');
        }
    }, [isSimplifiedEnabled, router]);

    if (!loaded || isSimplifiedEnabled === undefined) {
        return (
            <div className="min-h-screen bg-[#F5E6D3] flex items-center justify-center font-sans">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-[#3B5BDB] border-t-transparent rounded-full animate-spin" />
                    <p className="text-[16px] font-bold text-gray-700">Loading planner...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#F5E6D3] font-sans flex flex-col">
            {/* Navigation Loader Overlay */}
            {navigatingTo && (
                <div className="fixed inset-0 z-[9999] bg-[#F5E6D3]/80 backdrop-blur-sm flex flex-col items-center justify-center gap-5">
                    <div className="relative w-14 h-14">
                        <div className="absolute inset-0 rounded-full border-4 border-[#eadcc5]/50" />
                        <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-emerald-500" style={{ animation: 'spin 0.8s linear infinite' }} />
                    </div>
                    <span className="text-sm font-bold text-gray-600 tracking-wide">{navigatingTo}</span>
                </div>
            )}
            {/* Header */}
            <header className="w-full bg-[#FAFAFA]/90 backdrop-blur-md border-b border-[#eadcc5]/60 py-4 px-6 shrink-0 flex items-center justify-between shadow-sm sticky top-0 z-50">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2.5 cursor-pointer" onClick={() => router.push('/')}>
                        <Image src="/mic-logo.png" alt="MIC Logo" width={80} height={40} className="object-contain w-16 md:w-20 h-8 md:h-10" priority />
                        <span className="font-extrabold text-[20px] md:text-[24px] tracking-wider text-black select-none">FFCS</span>
                    </div>
                </div>
                
                <div className="flex items-center gap-4">
                    <div className="shrink-0 flex h-11 items-center gap-2 rounded-[10px] bg-[#D4F4E6] px-3 py-2 shadow-sm border border-emerald-300/30">
                        <span className="text-sm font-extrabold text-green-800 whitespace-nowrap">
                            Simplified Mode
                        </span>
                        <button
                            type="button"
                            role="switch"
                            onClick={() => navigateWithLoader('/preferences', 'Switching to Preferences...')}
                            aria-checked={true}
                            aria-label="Toggle advanced mode"
                            className="relative h-7 w-12 rounded-full shadow-inner transition-colors bg-emerald-500 focus:outline-none cursor-pointer"
                        >
                            <span className="absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full transition-all duration-200 left-6 bg-white" />
                        </button>
                    </div>

                    {session ? (
                        <div className="relative">
                            <div
                                className="flex items-center gap-2.5 cursor-pointer hover:opacity-85 transition-opacity py-1.5 px-3 rounded-full bg-white/70 border border-[#eadcc5]/60 hover:shadow-sm"
                                onClick={() => setShowUserMenu(!showUserMenu)}
                            >
                                {session.user?.image && (
                                    <Image src={session.user.image} alt="avatar" width={30} height={30} className="w-7 h-7 rounded-full object-cover" referrerPolicy="no-referrer" />
                                )}
                                <div className="profile-info-container">
                                    <span className="profile-name-text font-bold text-gray-900 text-sm">
                                        {parseName(session.user?.name).name}
                                    </span>
                                </div>
                                <svg
                                    className={`w-4 h-4 text-gray-700 transition-transform duration-200 ${showUserMenu ? 'rotate-180' : ''}`}
                                    viewBox="0 0 20 20"
                                    fill="none"
                                    aria-hidden="true"
                                >
                                    <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            </div>

                            {showUserMenu && (
                                <>
                                    <div className="fixed inset-0 z-10" onClick={() => setShowUserMenu(false)}></div>
                                    <div className="absolute right-0 mt-2 w-full min-w-[170px] bg-white/95 backdrop-blur-md border border-[#eadcc5]/80 rounded-2xl shadow-xl z-20 p-1.5 animate-in zoom-in-95 duration-200">
                                        <button
                                            className="w-full text-left px-3.5 py-2.5 text-sm text-red-600 font-bold hover:bg-red-50/70 rounded-xl transition-colors flex items-center gap-2.5 cursor-pointer"
                                            onClick={handleLogout}
                                        >
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" /></svg>
                                            <span>Log out</span>
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    ) : (
                        <button
                            className="flex items-center justify-center w-9 h-9 rounded-full bg-white/70 border border-[#eadcc5]/60 hover:shadow-sm hover:opacity-85 transition-all cursor-pointer"
                            onClick={() => setShowLogin(true)}
                            aria-label="Login"
                            title="Login"
                        >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500">
                                <circle cx="12" cy="8" r="4" />
                                <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
                                <circle cx="12" cy="8" r="1" fill="currentColor" stroke="none" />
                            </svg>
                        </button>
                    )}
                </div>
            </header>



            {/* Center Wrapper */}
            <div className="flex-1 w-full flex justify-center px-4 sm:px-6 py-6">
                {/* Single-column vertical stack */}
                <main className="w-full max-w-6xl flex flex-col gap-6">
                    
                    {/* Course Search Box */}
                    <div className="bg-white rounded-3xl p-5 md:p-6 shadow-[0_8px_30px_rgb(0,0,0,0.015)] border border-[#eaeaea]/80 flex flex-col gap-4 relative">
                        <div>
                            <h2 className="text-xl font-bold text-black flex items-center gap-2">
                                Search & Add Courses
                            </h2>
                            <p className="text-xs text-gray-500 mt-0.5">Type the course code or title (e.g. CSE1001 or Data Structures)</p>
                        </div>

                        <div className="flex gap-2 w-full">
                            <div ref={searchContainerRef} className="relative flex-1 group">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none group-focus-within:text-[#3B5BDB] transition-colors duration-200">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <circle cx="11" cy="11" r="8" />
                                        <path d="m21 21-4.3-4.3" />
                                    </svg>
                                </span>
                                <input
                                    type="text"
                                    value={searchTerm}
                                    onChange={(e) => {
                                        setSearchTerm(e.target.value);
                                        setFocusedIndex(-1);
                                        setShowDropdown(true);
                                    }}
                                    onFocus={() => setShowDropdown(true)}
                                    onKeyDown={handleKeyDown}
                                    placeholder="Search by code or title..."
                                    style={{ paddingLeft: '2.75rem', paddingRight: '3rem' }}
                                    className="w-full bg-[#FAFAFA] border border-[#eadcc5]/80 rounded-2xl py-3.5 text-sm font-medium text-black focus:outline-none focus:ring-2 focus:ring-[#3B5BDB]/60 transition-all duration-200 focus:bg-white focus:border-[#3B5BDB]/60 focus:shadow-[0_0_15px_rgba(59,91,219,0.08)]"
                                />
                                {searchTerm && (
                                    <button
                                        onClick={() => {
                                            setSearchTerm('');
                                            setFocusedIndex(-1);
                                            setShowDropdown(false);
                                        }}
                                        className="absolute right-4 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-black transition-all duration-200 text-xs font-semibold"
                                        title="Clear search"
                                    >
                                        ✕
                                    </button>
                                )}

                                {/* Search Results Dropdown Overlay */}
                                {showDropdown && searchResults.length > 0 && (
                                    <div className="absolute top-full left-0 right-0 mt-2 bg-white/95 backdrop-blur-md border border-gray-200 rounded-2xl shadow-[0_12px_30px_rgba(0,0,0,0.1)] z-30 max-h-72 overflow-y-auto custom-scrollbar p-2 animate-in fade-in slide-in-from-top-2 duration-200">
                                        {searchResults.map((result, idx) => {
                                            const isFocused = idx === focusedIndex;
                                            return (
                                                <button
                                                    key={result.code}
                                                    onClick={() => {
                                                        setActiveCourseCode(result.code);
                                                        setSearchTerm(`${result.code} - ${result.title}`);
                                                        setShowDropdown(false);
                                                        setFocusedIndex(-1);
                                                    }}
                                                    onMouseEnter={() => setFocusedIndex(idx)}
                                                    className={`w-full text-left px-4 py-3 rounded-xl transition-colors flex flex-col gap-0.5 cursor-pointer ${
                                                        isFocused
                                                            ? 'bg-[#3B5BDB]/10 text-black border border-[#3B5BDB]/20'
                                                            : 'hover:bg-gray-50 border border-transparent'
                                                    }`}
                                                >
                                                    <span className="font-extrabold text-xs text-[#3B5BDB] uppercase tracking-wider">
                                                        {highlightMatch(result.code, searchTerm)}
                                                    </span>
                                                    <span className="font-bold text-sm text-gray-900 line-clamp-1">
                                                        {highlightMatch(result.title, searchTerm)}
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    if (searchResults.length > 0) {
                                        const selectedIndex = focusedIndex >= 0 && focusedIndex < searchResults.length ? focusedIndex : 0;
                                        const target = searchResults[selectedIndex];
                                        setActiveCourseCode(target.code);
                                        setSearchTerm(`${target.code} - ${target.title}`);
                                        setShowDropdown(false);
                                        setFocusedIndex(-1);
                                    }
                                }}
                                disabled={!searchTerm.trim() || searchResults.length === 0}
                                className="px-6 py-3.5 bg-[#3B5BDB] hover:bg-[#2B4BBD] disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold text-sm rounded-2xl transition-all duration-200 shadow-sm hover:shadow-[0_4px_12px_rgba(59,91,219,0.2)] disabled:shadow-none flex items-center gap-2 cursor-pointer disabled:cursor-not-allowed shrink-0"
                            >
                                Search
                            </button>
                        </div>
                    </div>

                    {/* Active Course Selections */}
                    {activeCourseCode && (
                        <div className="bg-white rounded-3xl p-5 md:p-6 shadow-[0_8px_30px_rgb(0,0,0,0.015)] border border-[#eaeaea]/80 flex flex-col gap-4 animate-fade-slide-down">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <div className="flex-1 flex flex-col gap-1">
                                    <span className="text-[11px] font-bold text-[#3B5BDB] uppercase">{activeCourseCode}</span>
                                    <h3 className="text-xl font-bold text-black leading-tight">{activeCourseName}</h3>
                                </div>
                                <div className="flex items-center gap-3 w-full sm:w-auto">
                                    {/* Teacher/Slot Search Input */}
                                    <div className="relative w-full sm:w-64">
                                        <input
                                            type="text"
                                            value={teacherSearchTerm}
                                            onChange={(e) => setTeacherSearchTerm(e.target.value)}
                                            placeholder="Search teachers or slots..."
                                            className="w-full py-2 bg-gray-50 border border-gray-200 text-black placeholder-gray-400 text-sm rounded-xl focus:outline-none focus:border-[#3B5BDB] focus:bg-white transition-all"
                                            style={{ paddingLeft: '2.75rem', paddingRight: '2.25rem' }}
                                        />
                                        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                <circle cx="11" cy="11" r="8" />
                                                <line x1="21" y1="21" x2="16.65" y2="16.65" />
                                            </svg>
                                        </div>
                                        {teacherSearchTerm && (
                                            <button
                                                type="button"
                                                onClick={() => setTeacherSearchTerm('')}
                                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors p-0.5 cursor-pointer"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                    <line x1="18" y1="6" x2="6" y2="18" />
                                                    <line x1="6" y1="6" x2="18" y2="18" />
                                                </svg>
                                            </button>
                                        )}
                                    </div>
                                    <button
                                        onClick={() => {
                                            setActiveCourseCode(null);
                                            setSearchTerm('');
                                        }}
                                        className="text-[13px] font-bold text-gray-400 hover:text-gray-600 transition-colors cursor-pointer shrink-0"
                                    >
                                        Close
                                    </button>
                                </div>
                            </div>

                            <div className="w-full h-px bg-gray-100" />

                            {/* Slot Cards Grid */}
                            <div className={`grid ${gridColsClass} gap-3 pr-1`}>
                                {filteredCourseOptions.length === 0 ? (
                                    <p className="text-sm font-medium text-gray-400 text-center py-4 col-span-full">
                                        {activeCourseOptions.length === 0 ? "No faculties listed for this course." : "No matching teachers or slots found."}
                                    </p>
                                ) : (
                                    filteredCourseOptions.map((opt) => {
                                        const isSelected = isOptionSelected(opt.id);
                                        const isPending = pendingOption?.id === opt.id;
                                        return (
                                            <div
                                                key={opt.id}
                                                onClick={() => setPendingOption(opt)}
                                                className={`group w-full border rounded-2xl p-4 transition-all duration-300 flex items-center justify-between gap-3 cursor-pointer ${
                                                    isPending
                                                        ? 'bg-[#EBF1FF] border-[#3B5BDB] shadow-sm ring-1 ring-[#3B5BDB]'
                                                        : isSelected
                                                            ? 'bg-[#F4FBF7] border-[#D4F4E6] shadow-sm hover:border-[#bbf1d9]'
                                                            : 'bg-white border-gray-100 hover:border-gray-200 hover:shadow-sm'
                                                }`}
                                            >
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex flex-col">
                                                        <span className="font-extrabold text-sm text-gray-900 truncate leading-tight">{opt.facultyName}</span>
                                                    </div>
                                                    <div className="flex flex-col gap-1 mt-2.5">
                                                        {opt.theorySlot && (
                                                            <span className="text-[10px] font-extrabold px-2 py-0.5 bg-[#E1F9E9] border border-[#c3f2d2] rounded-md text-emerald-800 flex items-center gap-1 w-max">
                                                                {opt.theorySlot}
                                                            </span>
                                                        )}
                                                        {opt.labSlot && (
                                                            <span className="text-[10px] font-extrabold px-2 py-0.5 bg-[#FFF2BF] border border-[#fef08a] rounded-md text-amber-800 flex items-center gap-1 w-max">
                                                                {opt.labSlot}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                            
                            {/* Bottom Selection Actions Panel */}
                            <div className="w-full h-px bg-gray-100 my-2" />
                            
                            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-gray-50/70 p-4 rounded-2xl border border-gray-100">
                                <div className="flex items-center gap-3">
                                    <div className="flex-1 flex flex-col gap-0.5">
                                        <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                                            {pendingOption ? "Selected Faculty Preview" : "Selection Status"}
                                        </span>
                                        <div className="flex items-center gap-2">
                                            {pendingOption ? (
                                                <>
                                                    <span className="font-bold text-sm text-gray-900">
                                                        {pendingOption.facultyName}
                                                    </span>
                                                    <span className="text-xs text-black-600">
                                                        ({pendingOption.theorySlot ? `${pendingOption.theorySlot}` : ''}
                                                         {pendingOption.theorySlot && pendingOption.labSlot ? ' + ' : ''}
                                                         {pendingOption.labSlot ? `${pendingOption.labSlot}` : ''})
                                                    </span>
                                                </>
                                            ) : (
                                                <span className="text-sm font-medium text-gray-500 italic">
                                                    No teacher selected for preview. Click on a teacher card above.
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                
                                <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setActiveCourseCode(null);
                                            setPendingOption(null);
                                        }}
                                        className="px-4 py-2.5 border border-gray-200 text-gray-600 hover:bg-gray-100 bg-white font-bold text-xs rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        disabled={!pendingOption}
                                        onClick={() => {
                                            if (pendingOption) {
                                                const exists = selectedOptions.some(o => o.id === pendingOption.id);
                                                if (exists) {
                                                    setSelectedOptions(prev => prev.filter(o => o.id !== pendingOption.id));
                                                    showToast(`Removed ${pendingOption.facultyName} from ${activeCourseCode}`, 'success');
                                                } else {
                                                    setSelectedOptions(prev => [...prev, pendingOption]);
                                                    showToast(`Selected ${pendingOption.facultyName} for ${activeCourseCode}`, 'success');
                                                }
                                                setPendingOption(null);
                                            }
                                        }}
                                        className={`px-5 py-2.5 font-bold text-xs rounded-xl transition-all shadow-sm flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed ${pendingOption && selectedOptions.some(o => o.id === pendingOption.id) ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-emerald-600 hover:bg-emerald-700 text-white disabled:bg-gray-200 disabled:text-gray-400'}`}
                                    >
                                        {pendingOption && selectedOptions.some(o => o.id === pendingOption.id) ? 'Remove' : 'Select'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Selected Courses Summary */}
                    <div data-tour="courses-review-table" className="w-full flex-1 min-h-0 bg-[#fcfcfc] rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-[#eaeaea]/80 overflow-hidden flex flex-col mt-4">
                        <div className="bg-[#a9d6a9] px-6 py-4 shrink-0 flex items-center justify-between">
                            <h2 className="text-2xl font-bold text-[#1f1f1f]">Selected Courses</h2>
                            {undoStack.length > 0 && (
                                <button
                                    onClick={handleUndo}
                                    className="flex items-center gap-2 px-3 py-1.5 bg-white/60 hover:bg-white text-[#1f1f1f] font-bold text-sm rounded-xl shadow-sm transition-all"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M3 7v6h6" />
                                        <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
                                    </svg>
                                    Undo
                                </button>
                            )}
                        </div>

                        <div className="p-5 md:p-6 flex flex-col gap-4">
                            {/* List/Table */}
                        <div className="w-full overflow-x-auto custom-scrollbar">
                            {selectedOptions.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-center gap-2.5 py-6">
                                    {undoStack.length > 0 ? (
                                        <p className="text-sm font-semibold text-[#1f1f1f]">All courses have been deleted.</p>
                                    ) : (
                                        <>
                                            <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center text-gray-400" />
                                            <p className="text-sm font-semibold text-gray-400">No courses selected yet. Search above to begin!</p>
                                        </>
                                    )}
                                </div>
                            ) : (
                                <div className="min-w-[1000px] flex flex-col h-full">
                                    <div className="grid grid-cols-[40px_50px_minmax(110px,0.8fr)_minmax(180px,1.2fr)_minmax(160px,1fr)_minmax(100px,0.8fr)_minmax(100px,0.8fr)_50px_120px] border-b border-[#ededed] bg-[#fcfcfc] text-[#1f1f1f] shrink-0">
                                        <div className="px-4 py-3 text-sm font-bold flex items-center justify-center">
                                            <div className="relative group flex items-center justify-center">
                                                <input
                                                    type="checkbox"
                                                    checked={allSubjectsMode}
                                                    onChange={(e) => setAllSubjectsMode(e.target.checked)}
                                                    className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-600 focus:ring-offset-0 transition-colors cursor-pointer"
                                                />
                                                <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 hidden group-hover:block w-max bg-gray-900 text-white text-xs py-1 px-2 rounded whitespace-nowrap z-50">
                                                    All subjects mode
                                                </div>
                                            </div>
                                        </div>
                                        <div className="px-4 py-3 text-sm font-bold">No</div>
                                        <div className="px-4 py-3 text-sm font-bold">Course Code</div>
                                        <div className="px-4 py-3 text-sm font-bold">Course Name</div>
                                        <div className="px-4 py-3 text-sm font-bold">Faculty Name</div>
                                        <div className="px-4 py-3 text-sm font-bold">Slot</div>
                                        <div className="px-4 py-3 text-sm font-bold">Venue</div>
                                        <div className="px-4 py-3 text-sm font-bold text-center">CR</div>
                                        <div className="px-4 py-3 text-sm font-bold text-right">Actions</div>
                                    </div>
                                    <div className="flex-1 min-h-0 px-0">
                                        {selectedOptions.map((opt, index) => (
                                            <div
                                                key={opt.id}
                                                className={`grid grid-cols-[40px_50px_minmax(110px,0.8fr)_minmax(180px,1.2fr)_minmax(160px,1fr)_minmax(100px,0.8fr)_minmax(100px,0.8fr)_50px_120px] border-b border-[#f0f0f0] items-center transition-colors ${!allSubjectsMode && disabledOptions.has(opt.id) ? 'opacity-50 bg-gray-50' : clashingIds.has(opt.id) && (!disabledOptions.has(opt.id) || allSubjectsMode) ? 'bg-red-50 hover:bg-red-100 text-red-900' : 'bg-white hover:bg-[#f8f8f8]'}`}
                                            >
                                                <div className="px-4 py-4 flex items-center justify-center">
                                                    <input 
                                                        type="checkbox" 
                                                        checked={allSubjectsMode || !disabledOptions.has(opt.id)}
                                                        onChange={(e) => {
                                                            setDisabledOptions(prev => {
                                                                const next = new Set(prev);
                                                                if (e.target.checked) next.delete(opt.id);
                                                                else next.add(opt.id);
                                                                return next;
                                                             });
                                                        }}
                                                        disabled={allSubjectsMode}
                                                        className="w-4 h-4 rounded border-gray-300 text-[#3B5BDB] focus:ring-[#3B5BDB] cursor-pointer disabled:cursor-not-allowed"
                                                    />
                                                </div>
                                                <div className="px-4 py-4 text-sm font-semibold text-[#1f1f1f]">{index + 1}</div>
                                                <div className="px-4 py-4 text-sm font-semibold font-mono text-[#1f1f1f]">{opt.courseCode}</div>
                                                <div className="px-4 py-4 text-sm leading-relaxed text-[#1f1f1f]">{opt.courseName}</div>
                                                <div className="px-4 py-4 text-sm leading-relaxed text-[#1f1f1f]">{opt.facultyName}</div>
                                                <div className="px-4 py-4 text-sm font-semibold text-[#1f1f1f]">
                                                    <div className="flex flex-col gap-0.5">
                                                        {opt.theorySlot && <span className="font-bold">{opt.theorySlot}</span>}
                                                        {opt.labSlot && <span className="font-bold">{opt.labSlot}</span>}
                                                    </div>
                                                </div>
                                                <div className="px-4 py-4 text-sm font-semibold text-[#1f1f1f]">
                                                     <div className="flex flex-col gap-0.5">
                                                         {opt.theorySlot && <span className="font-bold">{lookupVenue(opt.courseCode, opt.theorySlot, opt.facultyName)}</span>}
                                                         {opt.labSlot && <span className="font-bold">{lookupVenue(opt.courseCode, opt.labSlot, opt.facultyName)}</span>}
                                                     </div>
                                                 </div>
                                                <div className="px-4 py-4 text-sm font-bold text-gray-700 text-center">{opt.credits}</div>
                                                <div className="px-4 py-4 flex items-center justify-end gap-2">
                                                    <button
                                                        onClick={() => handleMoveUp(index)}
                                                        disabled={index <= 0}
                                                        title="Move up"
                                                        className={`w-8 h-8 flex items-center justify-center rounded border transition-all ${index <= 0
                                                            ? 'border-gray-200 text-gray-300 cursor-not-allowed'
                                                            : 'border-gray-300 text-gray-600 hover:bg-gray-100 cursor-pointer'
                                                            }`}
                                                    >
                                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 15l-6-6-6 6" /></svg>
                                                    </button>
                                                    <button
                                                        onClick={() => handleMoveDown(index)}
                                                        disabled={index === selectedOptions.length - 1}
                                                        title="Move down"
                                                        className={`w-8 h-8 flex items-center justify-center rounded border transition-all ${index === selectedOptions.length - 1
                                                            ? 'border-gray-200 text-gray-300 cursor-not-allowed'
                                                            : 'border-gray-300 text-gray-600 hover:bg-gray-100 cursor-pointer'
                                                            }`}
                                                    >
                                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 9l6 6 6-6" /></svg>
                                                    </button>
                                                    <button
                                                        onClick={() => handleRemoveCourse(opt.courseCode)}
                                                        title="Remove"
                                                        className="w-8 h-8 flex items-center justify-center rounded border border-red-200 text-red-400 hover:bg-red-50 hover:text-red-600 cursor-pointer transition-all"
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                            <path d="M3 6h18" />
                                                            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                                                            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                                                            <line x1="10" x2="10" y1="11" y2="17" />
                                                            <line x1="14" x2="14" y1="11" y2="17" />
                                                        </svg>
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Footer Controls & Credits */}
                        {selectedOptions.length > 0 && (
                            <div className="pt-4 mt-2 border-t border-gray-100 shrink-0 flex flex-col md:flex-row items-center justify-between gap-4">
                                {/* Bottom Left: All Subjects Mode */}
                                <div className="flex-1 flex justify-start">
                                    <div className="flex items-center gap-2 bg-[#f2e6b5] rounded-xl px-3 py-2 shadow-[0_4px_10px_rgba(0,0,0,0.08)]">
                                        <span className="text-[13px] md:text-sm font-semibold text-[#1f1f1f]">All subjects mode</span>
                                        <button
                                            type="button"
                                            onClick={() => setIsHelpOpen(true)}
                                            className="w-6 h-6 rounded-full bg-[#e6c44c] text-[#1f1f1f] font-bold text-xs shadow-inner grid place-items-center hover:brightness-95 transition"
                                            aria-label="All subjects mode info"
                                        >
                                            ?
                                        </button>
                                        <label className="relative inline-flex items-center cursor-pointer select-none ml-1">
                                            <input
                                                type="checkbox"
                                                className="sr-only peer"
                                                checked={allSubjectsMode}
                                                onChange={(e) => setAllSubjectsMode(e.target.checked)}
                                            />
                                            <div className="w-11 h-6 bg-white border border-[#d8d1a3] rounded-full peer-checked:bg-[#e6c44c] transition-colors duration-200"></div>
                                            <div className="absolute left-1 top-1 w-4 h-4 bg-[#d8d1a3] rounded-full transition-all duration-200 peer-checked:translate-x-5 peer-checked:bg-white" />
                                        </label>
                                    </div>
                                </div>

                                {/* Center: Credits */}
                                <div className="shrink-0 flex items-center justify-center">
                                    <div className="flex items-center gap-3 text-black font-extrabold text-sm">
                                        <span>Total Selected Credits:</span>
                                        <span className="px-3.5 py-1.5 bg-[#E9D5FF] text-purple-800 rounded-full font-black text-xs border border-[#F2D8FE] shadow-sm">
                                            {totalCredits} Credits
                                        </span>
                                    </div>
                                </div>

                                {/* Bottom Right: Delete All */}
                                <div className="flex-1 flex justify-end">
                                    <button
                                        onClick={handleClearAll}
                                        className="flex items-center gap-2 px-4 py-2 rounded-xl text-red-600 font-bold text-sm bg-white border border-red-200 hover:bg-red-50 hover:border-red-300 transition-colors shadow-sm"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M3 6h18" />
                                            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                                            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                                            <line x1="10" x2="10" y1="11" y2="17" />
                                            <line x1="14" x2="14" y1="11" y2="17" />
                                        </svg>
                                        Delete all
                                    </button>
                                </div>
                            </div>
                        )}
                        </div>
                    </div>
                {/* Timetable Preview Box */}
                <div className="w-full flex flex-col gap-4 bg-white rounded-3xl p-5 md:p-6 shadow-[0_8px_30px_rgb(0,0,0,0.015)] border border-[#eaeaea]/80">
                    
                    {/* Visual Preview Header */}
                    <div className="flex flex-wrap items-center justify-between gap-4 shrink-0 border-b border-gray-100 pb-4">
                        <div>
                            <h2 className="text-xl font-bold text-black flex items-center gap-2">
                                Timetable Preview
                            </h2>
                            <p className="text-xs text-gray-500 mt-0.5">
                                Updates instantly on selection changes. Click on a timetable slot to view details.
                            </p>
                        </div>
                    </div>

                    {/* Table grid preview */}
                    <div className="w-full overflow-x-auto border border-gray-100 rounded-2xl bg-[#fbfbfb]">
                        {(selectedOptions.length > 0 && totalCombinations === 0) ? (
                            <div className="h-full min-h-[400px] flex flex-col items-center justify-center text-center p-6 md:p-8 gap-5 animate-lucid-fade-up bg-white rounded-2xl max-w-xl mx-auto">
                                <div className="relative flex items-center justify-center w-16 h-16 rounded-2xl bg-red-50 border border-red-100 shadow-sm">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-red-500 animate-pulse">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                    </svg>
                                    <div className="absolute -top-1 -right-1 flex h-3 w-3">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                                    </div>
                                </div>
                                
                                <div className="flex flex-col gap-1.5 max-w-sm">
                                    <h3 className="font-extrabold text-black text-lg tracking-tight">No Valid Combinations Found</h3>
                                    <p className="text-xs text-gray-500 leading-relaxed">
                                        Your selected courses clash in their timeslots. Try choosing a different faculty/slot combination for one of the clashing courses below.
                                    </p>
                                </div>
                                
                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={handleClearAll}
                                        className="px-5 py-2.5 bg-gradient-to-r from-red-500 to-pink-500 text-blue font-bold text-xs rounded-xl hover:from-red-600 hover:to-pink-600 transition-all shadow-md shadow-red-200/50 flex items-center gap-1.5 cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M3 6h18" />
                                            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                                            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                                        </svg>
                                        Reset Selection
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="p-1.5 h-full">
                                <table className="w-full table-fixed border-collapse bg-white text-center min-w-[840px] text-xs h-full min-h-[420px]">
                                    <thead>
                                        <tr className="border-b-2 border-white h-10">
                                            <th className="text-center font-bold text-black border-r-2 border-white bg-[#FAFAFA] w-16 md:w-20 p-0.5 text-[10px] md:text-[11px] leading-tight">Theory Hours</th>
                                            {[...leftTimes, { theory: '', lab: '' }, ...rightTimes].map((t, i) => (
                                                <th key={i} className={`text-center font-bold text-black border-r-2 border-white bg-[#FAFAFA] ${i === 6 ? 'w-8 px-0' : 'p-0.5 text-[10px] md:text-[11px] leading-tight'}`}>
                                                    {t.theory ? t.theory.split('-').map((part, idx, arr) => (
                                                        <span key={idx} className="block whitespace-nowrap">{part}{idx < arr.length - 1 ? '-' : ''}</span>
                                                    )) : null}
                                                </th>
                                            ))}
                                        </tr>
                                        <tr className="border-b-2 border-white h-10">
                                            <th className="text-center font-bold text-black border-r-2 border-white bg-[#FAFAFA] w-16 md:w-20 p-0.5 text-[10px] md:text-[11px] leading-tight">Lab Hours</th>
                                            {[...leftTimes, { theory: '', lab: '' }, ...rightTimes].map((t, i) => (
                                                <th key={i} className={`text-center font-bold text-black border-r-2 border-white bg-[#FAFAFA] ${i === 6 ? 'w-8 px-0' : 'p-0.5 text-[10px] md:text-[11px] leading-tight'}`}>
                                                    {t.lab ? t.lab.split('-').map((part, idx, arr) => (
                                                        <span key={idx} className="block whitespace-nowrap">{part}{idx < arr.length - 1 ? '-' : ''}</span>
                                                    )) : null}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white">
                                        {scheduleRows.map((row, rowIdx) => (
                                            <tr key={row.day} className="h-20">
                                                <td className="text-black text-center align-middle border-r-2 border-white bg-[#FAFAFA] font-bold w-16 md:w-20 p-0 text-[10.5px]">{row.day}</td>
                                                {Array.from({ length: 13 }).map((_, colIdx) => {
                                                    if (colIdx === 6) {
                                                        const lunchLetters = ['L', 'U', 'N', 'C', 'H'];
                                                        return (
                                                            <td key="lunch-spacer" className="border-r-2 border-white align-middle bg-[#f8f9fa] w-8 p-0">
                                                                <div className="flex h-full flex-col items-center justify-center">
                                                                    <span className="font-black text-black opacity-80 text-[10.5px]">
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
                                                             <div className="grid w-full grid-rows-2 gap-0 h-full min-h-[80px]">
                                                                 <div
                                                                     data-slot-label={theoryLabel}
                                                                     data-slot-category="theory"
                                                                     data-bgcolor={theoryBackgroundColor}
                                                                     className={`relative flex flex-col items-center justify-center transition-all cursor-pointer ${theoryCell ? 'z-10 py-1' : 'py-0'} ${isSameSlot(selectedSlot, theoryCell) ? 'brightness-110' : ''}`}
                                                                     style={{ backgroundColor: theoryBackgroundColor }}
                                                                     onClick={() => theoryCell && openSelectedSlot(theoryCell, 'theory')}
                                                                 >
                                                                     {theoryCell ? (
                                                                         <>
                                                                             <span className="font-semibold text-black text-[10.5px] md:text-[11.5px] leading-tight">{theoryLabel}</span>
                                                                             <span className="font-semibold text-[#1d5225] text-[9px] md:text-[9.5px] uppercase tracking-normal leading-tight w-full px-1 truncate">{theoryCell.courseCode}</span>
                                                                         </>
                                                                     ) : (
                                                                         <span className="font-bold text-[#4ea075] text-[10.5px] md:text-[11.5px] opacity-45">{theoryLabel}</span>
                                                                     )}
                                                                 </div>
 
                                                                 <div
                                                                     data-slot-label={labLabel}
                                                                     data-slot-category="lab"
                                                                     data-bgcolor={labBackgroundColor}
                                                                     className={`relative flex flex-col items-center justify-center transition-all cursor-pointer ${labCell ? 'z-10 py-1' : 'py-0'} ${isSameSlot(selectedSlot, labCell) ? 'brightness-110' : ''}`}
                                                                     style={{ backgroundColor: labBackgroundColor }}
                                                                     onClick={() => labCell && openSelectedSlot(labCell, 'lab')}
                                                                 >
                                                                     {labCell ? (
                                                                         <>
                                                                             <span className="font-semibold text-black text-[10.5px] md:text-[11.5px] leading-tight">{labLabel}</span>
                                                                             <span className="font-semibold text-[#665319] text-[9px] md:text-[9.5px] uppercase tracking-normal leading-tight w-full px-1 truncate">{labCell.courseCode}</span>
                                                                         </>
                                                                     ) : (
                                                                         <span className="font-bold text-[#d4a044] text-[10.5px] md:text-[11.5px] opacity-45">{labLabel}</span>
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
                            </div>
                        )}
                    </div>

                    {/* Bottom Controls panel */}
                    <div className="shrink-0 flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-gray-100">
                        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto justify-between sm:justify-start">

                            {/* Pagination */}
                            {totalCombinations > 0 && (
                                <div data-tour="timetable-pagination" className="flex items-center gap-1 bg-[#A0C4FF]/80 p-1 rounded-xl shadow-sm">
                                    <button
                                        onClick={() => setCurrentIndex(0)}
                                        className="w-6 h-6 md:w-8 md:h-8 flex items-center justify-center rounded-md md:rounded-lg text-black hover:bg-white/40 transition-colors font-bold text-[14px] md:text-lg"
                                    >
                                        «
                                    </button>
                                    <div className="flex gap-1">
                                        {[0, 1, 2, 3].map(idx => (
                                            idx < totalCombinations && (
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
                                        onClick={() => setCurrentIndex(totalCombinations - 1)}
                                        className="w-6 h-6 md:w-8 md:h-8 flex items-center justify-center rounded-md md:rounded-lg text-black hover:bg-white/40 transition-colors font-bold text-[14px] md:text-lg"
                                    >
                                        »
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Action Bar */}
                        <div className="grid grid-cols-3 sm:flex sm:flex-row items-stretch sm:items-center justify-end gap-1.5 md:gap-3 w-full sm:w-auto">
                            <button
                                onClick={handleShare}
                                disabled={selectedOptions.length === 0 || totalCombinations === 0}
                                className="col-span-1 sm:col-span-auto flex items-center justify-center gap-1.5 md:gap-2 bg-[#A0C4FF] hover:bg-[#8ab2f2] text-black font-bold py-3 px-3 md:px-6 rounded-2xl transition-all shadow-sm hover:shadow-md active:scale-95 disabled:opacity-50 text-xs md:text-sm w-full sm:w-auto"
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13" /></svg>
                                Share
                            </button>
                            <button
                                onClick={() => setShowDownloadModal(true)}
                                disabled={selectedOptions.length === 0 || totalCombinations === 0}
                                className="col-span-1 sm:col-span-auto flex items-center justify-center gap-1.5 md:gap-2 bg-[#C8F7DC] hover:bg-[#b0eac8] text-black font-bold py-3 px-3 md:px-6 rounded-2xl transition-all shadow-sm hover:shadow-md active:scale-95 disabled:opacity-50 text-xs md:text-sm w-full sm:w-auto"
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
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
                                disabled={isSaving || selectedOptions.length === 0 || totalCombinations === 0}
                                className="col-span-1 sm:col-span-auto flex items-center justify-center gap-1.5 md:gap-2 bg-[#F9A8D4]/60 hover:bg-[#F9A8D4]/80 text-black font-bold py-3 px-3 md:px-6 rounded-2xl transition-all shadow-sm hover:shadow-md active:scale-95 disabled:opacity-50 text-xs md:text-sm w-full sm:w-auto"
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" /></svg>
                                Save
                            </button>
                        </div>
                    </div>
                </div>
            </main>
            </div>

            {/* Hidden Export Elements for PDF Download */}
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
                <div 
                    className="fixed inset-0 flex items-center justify-center bg-black/35 px-4 backdrop-blur-sm" 
                    style={{ zIndex: 99999 }}
                    onClick={() => !isDownloading && setShowDownloadModal(false)}
                >
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
                <div 
                    className="fixed inset-0 flex items-center justify-center bg-black/35 px-4 backdrop-blur-sm" 
                    style={{ zIndex: 99999 }}
                    onClick={() => setShowShareModal(false)}
                >
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
                                href={`https://wa.me/?text=${encodeURIComponent(`Check out my FFCS timetable: ${shareUrl}`)}`}
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
                                href={`https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent('Check out my FFCS timetable')}`}
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
                <div 
                    className="fixed inset-0 flex items-center justify-center bg-black/35 px-4 backdrop-blur-sm" 
                    style={{ zIndex: 99999 }}
                    onClick={() => {
                        setSaveError('');
                        setShowSaveModal(false);
                    }}
                >
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

                        <div className="mb-3! rounded-2xl border border-[#eadcc5] bg-white p-2.5 shadow-[0_8px_24px_rgba(74,54,30,0.05)]">
                            <input
                                type="text"
                                value={timetableTitle}
                                onChange={(e) => {
                                    setTimetableTitle(e.target.value);
                                    if (saveError) {
                                         setSaveError('');
                                    }
                                }}
                                className="w-full rounded-xl bg-[#F8E8D2]/45 px-4 py-3.5 text-[16px] font-semibold text-black outline-none transition-all placeholder:font-medium placeholder:text-[#8a8177] focus:ring-2 focus:ring-[#A0C4FF]/45"
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
                                    handleSave(timetableTitle);
                                }}
                                disabled={isSaving || !timetableTitle.trim()}
                                className="min-h-13 rounded-2xl bg-[#A0C4FF] px-6 py-3.5 text-center text-[16px] font-black text-black shadow-[0_8px_20px_rgba(160,196,255,0.32)] transition-all hover:bg-[#8eb1ef] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A0C4FF]/70 active:scale-[0.98] disabled:opacity-50"
                            >
                                Save
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

            {toast && (
                <div 
                    className={`fixed top-8 right-8 text-white px-8 py-4 rounded-2xl shadow-2xl text-[14px] font-bold animate-[slideIn_0.3s_ease] border border-white/10 ${toastType === 'error' ? 'bg-red-500' : 'bg-[#1a1a2e]'}`}
                    style={{ zIndex: 100000 }}
                >
                    {toast}
                </div>
            )}

            {isHelpOpen && (
                <ModeHelpDialog
                    sections={ALL_SUBJECTS_MODE_HELP}
                    onClose={() => setIsHelpOpen(false)}
                />
            )}
            <SmallFooter />
            <style jsx>{`
                .custom-scrollbar { scrollbar-width: thin; scrollbar-color: #7bcf86 #eeeeee; }
                .custom-scrollbar::-webkit-scrollbar { width: 8px; height: 8px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: #eeeeee; border-radius: 6px; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #7bcf86; border-radius: 6px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #6bc679; }
            `}</style>
        </div>
    );
}
