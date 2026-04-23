// hearloop/apps/web/app/capture/[token]/page.tsx

import { notFound } from "next/navigation";
import Recorder from "../../../components/Recorder";

interface CapturePageProps {
  params: Promise<{ token: string }>;
}

async function getSessionConfig(token: string) {
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/public/session/${token}`,
      { cache: "no-store" }
    );
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default async function CapturePage({ params }: CapturePageProps) {
  const { token } = await params;
  const session = await getSessionConfig(token);

  if (!session) notFound();

  if (session.status === "expired") {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center p-8">
          <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center text-2xl mx-auto mb-4">
            ✕
          </div>
          <h1 className="text-lg font-medium text-gray-800">Link Expired</h1>
          <p className="text-sm text-gray-500 mt-2">
            This feedback link is no longer valid.
          </p>
        </div>
      </main>
    );
  }

  if (["submitted", "processing", "completed"].includes(session.status)) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center p-8">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center text-2xl mx-auto mb-4">
            ✓
          </div>
          <h1 className="text-lg font-medium text-gray-800">
            Already Submitted
          </h1>
          <p className="text-sm text-gray-500 mt-2">
            Your feedback has been received. Thank you!
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
        <div className="text-center mb-6">
          <h1 className="text-xl font-semibold text-gray-900">
            Share Your Feedback
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            Up to {session.maxDurationSec} seconds
          </p>
        </div>

        <Recorder
          sessionToken={token}
          maxDurationSec={session.maxDurationSec}
          promptText={session.promptText}
          consentRequired={session.consentRequired}
          consentText={session.consentText}
        />

        <p className="text-center text-xs text-gray-300 mt-6">
          Powered by Hearloop
        </p>
      </div>
    </main>
  );
}