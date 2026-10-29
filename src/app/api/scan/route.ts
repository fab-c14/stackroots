import { connection } from "next/server";
import { scanPublicRepo } from "@/lib/github-scan";

export async function POST(request: Request) {
  await connection();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, code: "bad-url", message: "Send a repository URL." }, { status: 400 });
  }

  const url = body && typeof body === "object" && "url" in body && typeof body.url === "string" ? body.url : "";
  const result = await scanPublicRepo(url, process.env.GITHUB_TOKEN);
  if (!result.ok) return Response.json(result, { status: result.code === "rate-limit" ? 429 : 400 });
  return Response.json(result);
}
