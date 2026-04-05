import { useNavigate } from "react-router-dom";
import mapImg from "../assets/map.jpg"; 

export default function LandingPagePremium() {
  const navigate = useNavigate();

  return (
    <div className="relative h-screen w-full flex items-center justify-center overflow-hidden bg-white text-slate-900">
      
      {/* 🌍 MAP BACKGROUND */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <img
          src={mapImg}
          alt="map"
          loading="lazy"
          className="w-full h-full object-cover opacity-60 blur-[1px] scale-105"
        />
      </div>

      {/* 🎨 SOFT WHITE OVERLAY */}
      <div className="absolute inset-0 z-10 bg-gradient-to-br from-white/85 via-white/75 to-white/85 pointer-events-none" />

      {/* 🌈 AESTHETIC COLOR BLOBS */}
      <div className="absolute inset-0 z-5 pointer-events-none">
        <div className="absolute top-[-200px] left-[-150px] w-[700px] h-[700px] bg-blue-400 opacity-20 blur-[160px] rounded-full" />
        <div className="absolute bottom-[-200px] right-[-150px] w-[700px] h-[700px] bg-purple-400 opacity-20 blur-[160px] rounded-full" />
        <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_1px_1px,#00000010_1px,transparent_0)] [background-size:22px_22px]" />
      </div>

      {/* 🌟 MAIN CONTENT */}
      <main className="relative z-20 w-full">
        <div className="text-center px-6 w-full max-w-5xl mx-auto motion-reduce:animate-none animate-hero-in">
          <h1 className="text-6xl md:text-7xl lg:text-8xl font-black leading-tight tracking-tight text-slate-900">
            Disaster{" "}
            <span className="bg-gradient-to-r from-blue-600 via-purple-600 to-pink-500 bg-clip-text text-transparent">
              Logistics
            </span>{" "}
            Optimization.
          </h1>

          <p className="mt-6 text-gray-600 text-lg max-w-2xl mx-auto">
            A minimal live preview of AEGIS — built for fast, confident routing under pressure.
          </p>

          <button
            type="button"
            onClick={() => navigate("/app")}
            className="mt-10 px-10 py-4 rounded-full bg-gradient-to-r from-blue-600 to-purple-600 text-white text-lg shadow-[0_20px_50px_-10px_rgba(59,130,246,0.6)] hover:scale-105 transition-all duration-300"
          >
            Start Planning Routes <span className="text-white/90">→</span>
          </button>
        </div>
      </main>
    </div>
  );
}