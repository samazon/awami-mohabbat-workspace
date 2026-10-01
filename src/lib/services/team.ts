import { CDN_BASE } from 'astro:env/server';
import { db } from '@/lib/db/client';
import { TEAM_GROUPS, type TeamGroupKey } from '@/lib/db/schema';
import { mediaUrl, teamPhotoKey } from '@/lib/media';
import { GROUP_TITLES, listMembers, type MemberRow } from '@/lib/team/data';

export interface TeamMemberView {
  id: number;
  nameEn: string;
  nameUr: string;
  roleEn: string | null;
  roleUr: string | null;
  placeEn: string | null;
  placeUr: string | null;
  country: string | null;
  photo: { src: string; width: number; height: number } | null;
}

export const photoUrl = (r: Pick<MemberRow, 'photoHash' | 'photoExt'>): string | null =>
  r.photoHash && r.photoExt ? mediaUrl(CDN_BASE, teamPhotoKey(r.photoHash, r.photoExt)) : null;

export const toView = (r: MemberRow): TeamMemberView => {
  const src = photoUrl(r);
  return {
    id: r.id,
    nameEn: r.nameEn,
    nameUr: r.nameUr,
    roleEn: r.roleEn,
    roleUr: r.roleUr,
    placeEn: r.placeEn,
    placeUr: r.placeUr,
    country: r.country,
    photo: src && r.photoWidth && r.photoHeight ? { src, width: r.photoWidth, height: r.photoHeight } : null,
  };
};

/** The public page: the featured member, then every group in order (empty groups dropped). */
export async function getTeamPage() {
  const rows = await listMembers(db());
  const featured = rows.find((r) => r.featured) ?? null;
  const groups = TEAM_GROUPS.map((key: TeamGroupKey) => ({
    key,
    title: GROUP_TITLES[key],
    members: rows.filter((r) => r.groupKey === key && r !== featured).map(toView),
    hasFeatured: featured?.groupKey === key,
  })).filter((g) => g.members.length > 0 || g.hasFeatured);
  return { featured: featured ? toView(featured) : null, groups };
}
