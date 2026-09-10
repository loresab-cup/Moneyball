import { Link } from "react-router-dom";

export default function Stub({ title }: { title: string }) {
  return (
    <div className="h-screen flex flex-col items-center justify-center gap-4">
      <h1 className="font-light text-[32px]">{title}</h1>
      <p className="font-light text-base text-black/60">Раздел в разработке</p>
      <Link to="/" className="bg-panel rounded-[15px] px-4 py-2 text-sm font-light">
        ← К проектам
      </Link>
    </div>
  );
}
