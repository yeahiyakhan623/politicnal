import { NextResponse, type NextRequest } from "next/server";
import type { PoolClient } from "pg";
import { apiError, readJsonBody, validationError } from "@/lib/api/http";
import { AuthorizationError } from "@/lib/auth/authorization";
import { assertSameOrigin } from "@/lib/auth/origin";
import { requireUser } from "@/lib/auth/require-user";
import { DEFAULT_PUBLIC_PROFILE } from "@/lib/public-profile/defaults";
import type { InstitutePublicProfile } from "@/lib/public-profile/types";
import { validatePublicProfile } from "@/lib/public-profile/validation";
import { getPool } from "@/lib/db";
import { resolveInstituteId } from "@/lib/students/service";

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_PROFILE_BODY_BYTES = 5_000_000;

type ProfileRow = Omit<InstitutePublicProfile, "instituteId" | "updatedAt"> & {
  instituteId: string;
  updatedAt: Date | string | null;
};

function mapProfile(row: ProfileRow): InstitutePublicProfile {
  return {
    ...row,
    updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
  };
}

export async function GET(request: NextRequest) {
  try {
    const instituteId = request.nextUrl.searchParams.get("instituteId") ?? "";
    if (!UUID.test(instituteId)) {
      return NextResponse.json({ error: "Select a valid institute." }, { status: 400 });
    }
    const result = await getPool().query<ProfileRow>(
      `SELECT p.institute_id AS "instituteId", p.institute_name AS "instituteName",
              p.hero_title AS "heroTitle", p.hero_title_bn AS "heroTitleBn",
              p.hero_description AS "heroDescription", p.overview, p.history,
              p.leadership, p.departments, p.services, p.contact, p.links,
              p.updated_at AS "updatedAt"
       FROM public.institute_public_profiles p
       JOIN public.institutes i ON i.id = p.institute_id
       WHERE p.institute_id = $1 AND i.category = 'polytechnic' AND i.review_status = 'approved'`,
      [instituteId],
    );
    const row = result.rows[0];
    if (row) return NextResponse.json({ data: mapProfile(row) }, { headers: { "Cache-Control": "no-store" } });

    const institute = await getPool().query(
      "SELECT 1 FROM public.institutes WHERE id = $1 AND category = 'polytechnic' AND review_status = 'approved'",
      [instituteId],
    );
    if (!institute.rowCount) return NextResponse.json({ error: "Institute profile is not available." }, { status: 404 });
    return NextResponse.json({
      data: { instituteId, ...DEFAULT_PUBLIC_PROFILE, updatedAt: null },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const response = apiError(error);
    if (response) return response;
    console.error("Public institute profile query failed.", error);
    return NextResponse.json({ error: "Unable to load the institute profile." }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  let client: PoolClient | undefined;
  let transactionOpen = false;
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    if (!["SUPER_ADMIN", "INSTITUTE_ADMIN"].includes(user.role)) {
      throw new AuthorizationError("Only institute administrators can manage the public profile.");
    }
    const body = await readJsonBody(request, MAX_PROFILE_BODY_BYTES);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Institute profile data is required." }, { status: 400 });
    }
    const data = body as Record<string, unknown>;
    const requestedInstituteId = typeof data.instituteId === "string" ? data.instituteId : null;
    const instituteId = await resolveInstituteId(user, requestedInstituteId);
    if (!UUID.test(instituteId)) {
      return NextResponse.json({ error: "Select a valid institute." }, { status: 400 });
    }
    let profile: ReturnType<typeof validatePublicProfile>;
    try {
      profile = validatePublicProfile(data.profile);
    } catch (error) {
      return validationError(error);
    }

    client = await getPool().connect();
    await client.query("BEGIN");
    transactionOpen = true;
    const result = await client.query<ProfileRow>(
      `INSERT INTO public.institute_public_profiles
         (institute_id, institute_name, hero_title, hero_title_bn, hero_description,
          overview, history, leadership, departments, services, contact, links, updated_by, updated_at)
       SELECT $1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb,$11::jsonb,$12::jsonb,$13,now()
       WHERE EXISTS (
         SELECT 1 FROM public.institutes
         WHERE id = $1 AND category = 'polytechnic' AND review_status = 'approved'
       )
       ON CONFLICT (institute_id) DO UPDATE SET
         institute_name = EXCLUDED.institute_name,
         hero_title = EXCLUDED.hero_title,
         hero_title_bn = EXCLUDED.hero_title_bn,
         hero_description = EXCLUDED.hero_description,
         overview = EXCLUDED.overview,
         history = EXCLUDED.history,
         leadership = EXCLUDED.leadership,
         departments = EXCLUDED.departments,
         services = EXCLUDED.services,
         contact = EXCLUDED.contact,
         links = EXCLUDED.links,
         updated_by = EXCLUDED.updated_by,
         updated_at = now()
       RETURNING institute_id AS "instituteId", institute_name AS "instituteName",
                 hero_title AS "heroTitle", hero_title_bn AS "heroTitleBn",
                 hero_description AS "heroDescription", overview, history,
                 leadership, departments, services, contact, links, updated_at AS "updatedAt"`,
      [
        instituteId,
        profile.instituteName,
        profile.heroTitle,
        profile.heroTitleBn,
        profile.heroDescription,
        profile.overview,
        profile.history,
        JSON.stringify(profile.leadership),
        JSON.stringify(profile.departments),
        JSON.stringify(profile.services),
        JSON.stringify(profile.contact),
        JSON.stringify(profile.links),
        user.id,
      ],
    );
    const saved = result.rows[0];
    if (!saved) throw new Error("Approved polytechnic institute was not found while saving its profile.");
    await client.query(
      `INSERT INTO public.admin_audit_logs
         (actor_user_id, actor_role, action, target_type, target_id, after_value)
       VALUES ($1,$2,'institute_public_profile.updated','institute_public_profile',$3,$4::jsonb)`,
      [user.id, user.role.toLowerCase(), instituteId, JSON.stringify({
        leaderCount: profile.leadership.length,
        departmentCount: profile.departments.length,
        serviceCount: profile.services.length,
        linkCount: profile.links.length,
      })],
    );
    await client.query("COMMIT");
    transactionOpen = false;
    return NextResponse.json({ data: mapProfile(saved) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (client && transactionOpen) await client.query("ROLLBACK").catch(() => undefined);
    const response = apiError(error);
    if (response) return response;
    console.error("Institute public profile update failed.", error);
    return NextResponse.json({ error: "Unable to save the institute profile." }, { status: 500 });
  } finally {
    client?.release();
  }
}
