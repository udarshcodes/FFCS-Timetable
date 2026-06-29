import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import Course from '@/models/course';
import { enforceRateLimit } from '@/lib/rateLimit';
import chennaiCourses from '@/data/all_data_chennai';

export const dynamic = 'force-dynamic';

const ALLOWED_SCHOOLS = new Set([
    'CHENNAI',
    'SCHEME',
    'SCHEME_F',
    'SCOPE',
    'SCOPE_F',
    'SCORE',
    'SCORE_F',
    'SELECT',
    'SELECT_F',
    'SENSE',
    'SENSE_F',
    'SHINE',
    'SHINE_F',
    'SMEC',
    'SMEC_F',
    'SBST',
    'SBST_F',
    'SCE',
    'MTECH_SCOPE',
    'MTECH_SCORE',
]);

function buildChennaiCourseCatalog() {
    const courseMap = new Map<string, {
        courseId: string;
        courseName: string;
        school: string;
        courseType: 'th' | 'lab' | 'both';
        offerings: { faculty: string; slot: string; venue: string }[];
    }>();

    for (const record of chennaiCourses) {
        const current = courseMap.get(record.CODE) || {
            courseId: record.CODE,
            courseName: record.TITLE,
            school: 'CHENNAI',
            courseType: 'th' as const,
            offerings: [],
        };

        const normalizedType = record.TYPE.trim().toUpperCase();
        current.courseType = normalizedType === 'LO' ? 'lab' : 'th';
        current.offerings.push({
            faculty: record.FACULTY,
            slot: record.SLOT,
            venue: (record as any).VENUE || 'TBD',
        });

        courseMap.set(record.CODE, current);
    }

    return Array.from(courseMap.values()).map((course) => {
        const hasTheory = course.offerings.some((offering) => !offering.slot.startsWith('L'));
        const hasLab = course.offerings.some((offering) => offering.slot.startsWith('L'));

        return {
            ...course,
            courseType: hasTheory && hasLab ? 'both' : hasLab ? 'lab' : 'th',
        };
    });
}

function searchChennaiCourses(q: string, limit: number) {
    const catalog = buildChennaiCourseCatalog();
    const query = q.toLowerCase();

    const filtered = catalog.filter((course) => {
        if (!query) return true;
        return [course.courseId, course.courseName, course.school, course.courseType, ...course.offerings.flatMap((offering) => [offering.faculty, offering.slot])]
            .join(' ')
            .toLowerCase()
            .includes(query);
    });

    return filtered.slice(0, limit);
}

/**
 * GET /api/courses?q=BCSE202&school=SCOPE&limit=20
 *
 * Search for courses by courseId or courseName.
 * Results are ordered by relevance (text score) when a query is given,
 * otherwise returns the first `limit` courses.
 */
export async function GET(req: NextRequest) {
    const rateLimit = await enforceRateLimit(req, {
        key: 'courses-search',
        windowMs: 60_000,
        maxRequests: 60,
    });

    if (rateLimit.limited) {
        return rateLimit.response;
    }

    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q')?.trim().slice(0, 120) ?? '';
    const school = searchParams.get('school')?.trim();
    const normalizedSchool = school?.toUpperCase();
    const parsedLimit = Number.parseInt(searchParams.get('limit') ?? '20', 10);
    const limit = Number.isNaN(parsedLimit) ? 20 : Math.min(Math.max(parsedLimit, 1), 100);

    if (normalizedSchool && !ALLOWED_SCHOOLS.has(normalizedSchool)) {
        return NextResponse.json(
            { error: 'Invalid school parameter' },
            { status: 400, headers: rateLimit.headers }
        );
    }

    if (normalizedSchool === 'CHENNAI') {
        return NextResponse.json(
            { success: true, courses: searchChennaiCourses(q, limit) },
            { headers: rateLimit.headers }
        );
    }

    await dbConnect();

    const filter: Record<string, unknown> = {};

    if (q) {
        const escapedQuery = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`^${escapedQuery.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
        filter.$or = [{ courseId: regex }, { courseName: regex }];
    }

    if (normalizedSchool) {
        filter.school = normalizedSchool;
    }

    const courses = await Course.find(filter)
        .select('-__v')
        .limit(limit)
        .lean();

    return NextResponse.json(
        { success: true, courses },
        { headers: rateLimit.headers }
    );
}
