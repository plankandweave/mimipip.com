"use client";
export default function OfficeError({reset}:{reset:()=>void}) {
  return <div className="container-x py-16"><h1 className="text-2xl">Your office collection is taking a moment.</h1><p className="mt-4">Please try again. Any selection saved on this device is still here.</p><button className="btn mt-6 px-6 py-3" onClick={reset}>Try again</button></div>;
}
