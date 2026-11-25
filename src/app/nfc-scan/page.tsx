"use client";

import { useCallback, useEffect, useState } from "react";
import { Nfc, RotateCcw } from "lucide-react";

const CARD_MEDIA_TYPE = "application/vnd.amrpi.student-card";

type NdefRecord = {
  recordType: string;
  mediaType?: string;
  data: DataView;
};

type NdefReadingEvent = Event & {
  message: { records: NdefRecord[] };
};

type StudentCardIdentity = {
  name: string;
  rollNumber: string;
  registrationNumber: string;
  department: string;
  semester: number;
  sessionYear: string;
  instituteName: string;
};

type NdefReaderLike = {
  scan: (options?: { signal?: AbortSignal }) => Promise<void>;
  write: (message: { records: { recordType: string; mediaType?: string; data: string }[] }) => Promise<void>;
  addEventListener: (type: "reading", listener: (event: Event) => void) => void;
};

declare global {
  interface Window {
    NDEFReader?: new () => NdefReaderLike;
  }
}

export default function NfcScanPage() {
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");
  const [student, setStudent] = useState<StudentCardIdentity | null>(null);

  const verifyCard = useCallback(async (token: string, method: "nfc" | "qr") => {
    const response = await fetch("/api/public/student-card/scan", {
      method: "POST",
      cache: "no-store",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, method }),
    });
    const body = await response.json() as {
      error?: string;
      student?: StudentCardIdentity;
    };
    if (!response.ok || !body.student) {
      throw new Error(body.error ?? "Unable to verify this student card.");
    }
    setStudent(body.student);
  }, []);

  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get("token");
    if (!token) return;
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    queueMicrotask(() => {
      void verifyCard(token, "qr").catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : "Unable to verify this student card.");
      });
    });
  }, [verifyCard]);

  async function startScan() {
    setError("");
    setStudent(null);
    const Reader = window.NDEFReader;
    if (!Reader) {
      setError("NFC scanning is not supported by this browser or device. Use a compatible NFC-enabled device over HTTPS.");
      return;
    }

    const controller = new AbortController();
    const reader = new Reader();
    let handlingScan = false;
    reader.addEventListener("reading", (event) => {
      if (handlingScan) return;
      const record = (event as NdefReadingEvent).message.records.find(
        (item) => item.recordType === "mime" && item.mediaType === CARD_MEDIA_TYPE,
      );
      if (!record) {
        setError("This tag is not an AMRPI student card.");
        controller.abort();
        setScanning(false);
        return;
      }

      handlingScan = true;
      controller.abort();
      const token = new TextDecoder().decode(record.data);
      void verifyCard(token, "nfc").catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : "Unable to verify this student card.");
      }).finally(() => setScanning(false));
    });

    try {
      setScanning(true);
      await reader.scan({ signal: controller.signal });
    } catch (reason) {
      setScanning(false);
      if (reason instanceof Error && reason.name !== "AbortError") {
        setError("NFC scan could not start. Check device support and browser NFC permissions.");
      }
    }
  }

  return (
    <main className="student-page">
      <header className="student-header"><div className="brand-mark"><span>AM</span></div><div><strong>AMRPI</strong><span>STUDENT CARD SCANNER</span></div></header>
      <section className="student-content">
        <div className="eyebrow">CARD VERIFICATION</div>
        <h1>Scan student NFC card</h1>
        <p className="subtitle">Only active cards linked to approved institute student records are accepted. Each valid scan is recorded.</p>
        {error && <div className="login-alert" role="alert">{error}</div>}
        {student ? <section className="student-details" aria-live="polite">
          <h2>{student.name || "Student"}</h2>
          <div className="profile-grid">
            {[
              ["Institute", student.instituteName],
              ["Roll number", student.rollNumber],
              ["Registration number", student.registrationNumber],
              ["Department", student.department || "Not provided"],
              ["Semester", `${student.semester}`],
              ["Session", student.sessionYear || "Not provided"],
            ].map(([label, value]) => <div className="profile-field" key={label}><span>{label}</span><strong>{value}</strong></div>)}
          </div>
        </section> : <button className="btn primary" type="button" disabled={scanning} onClick={() => void startScan()}>
          {scanning ? <><Nfc size={16} />Hold the card near this device…</> : <><Nfc size={16} />Start NFC scan</>}
        </button>}
        {student && <button className="btn" type="button" onClick={() => { setStudent(null); setError(""); }}>
          <RotateCcw size={15} />Scan another card
        </button>}
      </section>
    </main>
  );
}
