import { notFound } from "next/navigation";
import { getKid } from "@/lib/data/stub";
import KidShell from "@/components/kid/KidShell";
import { getCourse } from "@/lib/courses/registry";
import { getCourseProgress } from "@/lib/actions/course";
import CourseClient from "@/components/course/CourseClient";

export default async function CoursePage({
  params,
  searchParams,
}: {
  params: Promise<{ courseId: string }>;
  searchParams: Promise<{ kid?: string }>;
}) {
  const { courseId } = await params;
  const { kid: kidId } = await searchParams;
  const course = getCourse(courseId);
  if (!course) notFound();

  const kid = kidId ? await getKid(kidId) : null;
  const progress = kid ? await getCourseProgress(kid.id, courseId) : [];

  const content = <CourseClient course={course} kidId={kid?.id ?? null} initialProgress={progress} />;

  if (kid) {
    return <KidShell kid={kid} active="play">{content}</KidShell>;
  }
  return content;
}
