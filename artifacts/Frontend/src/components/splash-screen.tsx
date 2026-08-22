import { motion } from "framer-motion";
import { Zap } from "lucide-react";

export default function SplashScreen() {
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-between py-16 bg-white"
      style={{
        backgroundImage: `
          linear-gradient(to right, rgba(0, 0, 0, 0.035) 1px, transparent 1px),
          linear-gradient(to bottom, rgba(0, 0, 0, 0.035) 1px, transparent 1px)
        `,
        backgroundSize: "24px 24px",
      }}
    >
      {/* Empty space for vertical layout balance */}
      <div />

      {/* Center content */}
      <div className="flex flex-col items-center text-center">
        {/* Logo Container */}
        <motion.div
          initial={{ opacity: 0, scale: 0.4 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring", stiffness: 180, damping: 15, delay: 0.15 }}
          className="w-24 h-24 rounded-full bg-white border border-orange-100 flex items-center justify-center shadow-2xl shadow-orange-500/10 mb-6"
        >
          <Zap className="w-11 h-11 text-orange-500 fill-orange-500" />
        </motion.div>

        {/* Title */}
        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut", delay: 0.45 }}
          className="text-3xl font-extrabold tracking-tight"
          style={{ color: "#0C5179" }}
        >
          GenOps
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut", delay: 0.7 }}
          className="text-xs font-semibold tracking-wide text-gray-500 mt-2"
        >
          Generator Management System
        </motion.p>
      </div>

      {/* Bottom Loading Progress */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.95 }}
        className="flex flex-col items-center w-full max-w-[220px]"
      >
        <span className="text-[10px] font-extrabold tracking-widest text-slate-400 uppercase mb-2">
          Loading...
        </span>
        {/* Progress Bar Track */}
        <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden relative border border-slate-200/10">
          {/* Progress Bar Indicator */}
          <motion.div
            initial={{ width: "0%" }}
            animate={{ width: "100%" }}
            transition={{ duration: 0.90, ease: "easeInOut", delay: 0.95 }}
            className="h-full bg-orange-500 rounded-full"
          />
        </div>
      </motion.div>
    </div>
  );
}
