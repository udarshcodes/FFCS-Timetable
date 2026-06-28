'use client';

import type { Step } from 'react-joyride';

export const PLANNER_TOUR_STORAGE_KEY = 'ffcs:planner-onboarding-tour:v1';
export const PLANNER_TOUR_SESSION_KEY = 'ffcs:planner-onboarding-tour:active-step';
export const PREFERENCE_TOUR_STEP_EVENT = 'planner-tour:preferences-step';

export type PlannerTourRoute = '/preferences' | '/courses' | '/timetable' | '/saved';

export type PlannerTourStep = Step & {
    route: PlannerTourRoute;
    auth?: 'authenticated' | 'guest';
    preferenceStep?: number;
};

export const setPreferenceStep = async (step: number) => {
    if (typeof window === 'undefined') return;

    window.dispatchEvent(new CustomEvent(PREFERENCE_TOUR_STEP_EVENT, { detail: { step } }));
    const timeoutId = window.setTimeout(() => {}, 120);
    await new Promise(resolve => {
        window.setTimeout(resolve, 120);
        window.clearTimeout(timeoutId);
    });
};

export const plannerTourSteps: PlannerTourStep[] = [
    {
        route: '/preferences',
        target: '[data-tour="preferences-intro"]',
        title: 'Start with preferences',
        content: 'This is where you build the inputs for your timetable: domain, subject, slot, faculty, and priority.',
        placement: 'bottom',
    },
    {
        route: '/preferences',
        target: '[data-tour="preferences-step-1"]',
        title: 'Choose your domain',
        content: 'Pick the department or course domain first. The next step uses this to show matching subjects.',
        placement: 'right',
        preferenceStep: 1,
        before: () => setPreferenceStep(1),
    },
    {
        route: '/preferences',
        target: '[data-tour="preferences-step-2"]',
        title: 'Pick a subject',
        content: 'Select the course you want to include. The planner will then show slots available for that subject.',
        placement: 'right',
        preferenceStep: 2,
        before: () => setPreferenceStep(2),
    },
    {
        route: '/preferences',
        target: '[data-tour="preferences-step-3"]',
        title: 'Select a slot',
        content: 'In the normal flow, choose the slot timing before selecting faculty.',
        placement: 'right',
        preferenceStep: 3,
        before: () => setPreferenceStep(3),
    },
    {
        route: '/preferences',
        target: '[data-tour="preferences-step-4"]',
        title: 'Choose faculty',
        content: 'Pick one or more faculty options for the selected subject and slot.',
        placement: 'right',
        preferenceStep: 4,
        before: () => setPreferenceStep(4),
    },
    {
        route: '/preferences',
        target: '[data-tour="preferences-step-5"]',
        title: 'Set faculty priority',
        content: 'Review selected faculty preferences, reorder them, add another subject, or continue to the courses review.',
        placement: 'left',
        preferenceStep: 5,
        before: () => setPreferenceStep(5),
    },
    {
        route: '/preferences',
        target: '[data-tour="preferences-faculty-first-mode"]',
        title: 'Faculty first mode',
        content: 'Turn this on when faculty matters more than slot timing. It changes the preference flow so you choose faculty before slots.',
        placement: 'bottom',
    },
    {
        route: '/courses',
        target: '[data-tour="courses-review-table"]',
        title: 'Review selected courses',
        content: 'This table summarizes the subjects, faculty, and slots you added from Preferences.',
        placement: 'top',
    },
    {
        route: '/courses',
        target: '[data-tour="courses-all-subjects-mode"]',
        title: 'All Subjects Mode',
        content: 'When ON, generated timetables must include every selected subject. When OFF, subject order acts as priority and lower-priority clashes can be excluded.',
        placement: 'top',
    },
    {
        route: '/courses',
        target: '[data-tour="courses-generate-next"]',
        title: 'Generate timetables',
        content: 'Use Next to generate possible timetable options from the courses currently in this review table.',
        placement: 'top',
    },
    {
        route: '/timetable',
        target: '[data-tour="timetable-grid"]',
        title: 'Generated options',
        content: 'This page shows the timetable options generated from your selected courses and constraints.',
        placement: 'bottom',
    },
    {
        route: '/timetable',
        target: '[data-tour="timetable-pagination"]',
        title: 'Switch options',
        content: 'Use these controls to compare multiple generated timetable combinations.',
        placement: 'top',
    },
    {
        route: '/timetable',
        target: '[data-tour="timetable-bottom-navigation"]',
        title: 'Continue to Saved',
        content: 'After reviewing an option, use the flow navigation to continue toward your saved timetables.',
        placement: 'top',
    },
    {
        route: '/timetable',
        target: 'body',
        title: 'Saved after sign-in',
        content: 'Once you sign in and save a timetable, the Saved section will show your schedules as cards you can view, edit, rename, delete, or share later.',
        placement: 'center',
        auth: 'guest',
    },
    {
        route: '/timetable',
        target: 'body',
        title: "You're ready to plan",
        content: 'That is the full planner flow. The tour is complete, and it will not appear again unless this tour version is reset.',
        placement: 'center',
        auth: 'guest',
    },
    {
        route: '/saved',
        target: '[data-tour="saved-timetables-list"]',
        title: 'Saved timetables',
        content: 'Your saved schedules live here, ready to view, edit, rename, delete, or share later.',
        placement: 'bottom',
        auth: 'authenticated',
    },
    {
        route: '/saved',
        target: 'body',
        title: "You're ready to plan",
        content: 'That is the full planner flow. The tour is complete, and it will not appear again unless this tour version is reset.',
        placement: 'center',
        auth: 'authenticated',
    },
];
