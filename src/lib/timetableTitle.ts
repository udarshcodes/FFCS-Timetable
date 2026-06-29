import Timetable from '@/models/timetable';

function escapeRegex(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

type ResolveOptions = {
    owner: string;
    requestedTitle: string;
    excludeId?: string;
};

export async function resolveUniqueTimetableTitle(options: ResolveOptions) {
    const { owner, requestedTitle, excludeId } = options;
    const trimmedTitle = requestedTitle.trim();

const sanitizedTitle = escapeRegex(trimmedTitle);
const regexPattern = `^${sanitizedTitle}(?: (\\d+))?$`;
const query: {
    owner: string;
    title: { $regex: RegExp };
    _id?: { $ne: string };
} = {
    owner,
    title: { $regex: new RegExp(regexPattern, 'i') },
    _id: excludeId ? { $ne: excludeId } : undefined,
};


    const existing = await Timetable.find(query).select('title').lean();
    if (existing.length === 0) {
        return trimmedTitle;
    }

    const usedSuffixes = new Set<number>();
    for (const item of existing as Array<{ title?: string }>) {
        const title = item.title || '';
        if (title === trimmedTitle) {
            usedSuffixes.add(1);
            continue;
        }

        const sanitizedTitle = escapeRegex(trimmedTitle);
const regex = new RegExp(`^${escapeRegex(trimmedTitle)}(?: (\\d+))?$`, 'i');
const match = title.match(regex);
        if (match?.[1]) {
            const suffix = Number.parseInt(match[1], 10);
            if (!Number.isNaN(suffix) && suffix > 1) {
                usedSuffixes.add(suffix);
            }
        }
    }

    if (!usedSuffixes.has(1)) {
        return trimmedTitle;
    }

    let nextSuffix = 2;
    while (usedSuffixes.has(nextSuffix)) {
        nextSuffix += 1;
    }

    return `${trimmedTitle} ${nextSuffix}`;
}
