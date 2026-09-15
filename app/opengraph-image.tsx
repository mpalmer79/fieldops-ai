import { ImageResponse } from "next/og";

export const alt = "FieldOps AI automotive service operations platform";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        position: "relative",
        overflow: "hidden",
        background: "linear-gradient(145deg, #effaf7 0%, #f9fcfb 55%, #e7f5f2 100%)",
        color: "#153730",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div
        style={{
          position: "absolute",
          width: 430,
          height: 430,
          borderRadius: 430,
          right: -90,
          top: -140,
          background: "rgba(96, 221, 192, 0.22)",
        }}
      />
      <div
        style={{
          position: "absolute",
          width: 360,
          height: 360,
          borderRadius: 360,
          left: -140,
          bottom: -170,
          background: "rgba(164, 232, 217, 0.28)",
        }}
      />

      <div
        style={{
          width: "100%",
          display: "flex",
          padding: "64px 68px",
          gap: 54,
          alignItems: "stretch",
        }}
      >
        <div style={{ flex: 1.15, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 28 }}>
              <div
                style={{
                  width: 54,
                  height: 54,
                  borderRadius: 14,
                  border: "2px solid #5a9f91",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#0f8873",
                  fontSize: 27,
                  fontWeight: 800,
                }}
              >
                FO
              </div>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ fontSize: 27, fontWeight: 800, letterSpacing: 1 }}>FIELD/OPS AI</div>
                <div style={{ fontSize: 14, letterSpacing: 3, color: "#57776f", marginTop: 5 }}>AUTOMOTIVE SERVICE OPERATIONS</div>
              </div>
            </div>

            <div style={{ fontSize: 58, lineHeight: 1.03, fontWeight: 800, letterSpacing: -2, maxWidth: 670 }}>
              Protect customer promises when the shop plan breaks.
            </div>
            <div style={{ fontSize: 23, lineHeight: 1.45, color: "#56736d", marginTop: 24, maxWidth: 670 }}>
              Constraint-based recovery, manager approval, and auditable execution for dealership service operations.
            </div>
          </div>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {["Constraint recovery", "Human approval", "AgentOps", "Audit + rollback"].map((label) => (
              <div
                key={label}
                style={{
                  display: "flex",
                  padding: "11px 16px",
                  borderRadius: 999,
                  background: "rgba(255,255,255,0.78)",
                  border: "1px solid #b8d7d0",
                  color: "#28544a",
                  fontSize: 16,
                  fontWeight: 700,
                }}
              >
                {label}
              </div>
            ))}
          </div>
        </div>

        <div
          style={{
            width: 385,
            display: "flex",
            flexDirection: "column",
            borderRadius: 24,
            background: "rgba(255,255,255,0.9)",
            border: "2px solid #b8d7d0",
            boxShadow: "0 24px 60px rgba(21, 69, 60, 0.14)",
            overflow: "hidden",
          }}
        >
          <div style={{ height: 8, width: "100%", background: "linear-gradient(90deg, #138b76, #49cdb3)" }} />
          <div style={{ display: "flex", flexDirection: "column", padding: "30px 30px 26px" }}>
            <div style={{ fontSize: 14, letterSpacing: 2, color: "#14846f", fontWeight: 800 }}>SERVICE COMMAND</div>
            <div style={{ fontSize: 28, lineHeight: 1.1, fontWeight: 800, marginTop: 10 }}>Live recovery control</div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", margin: "0 24px", borderRadius: 16, background: "#17342f", color: "#ffffff", padding: "22px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, letterSpacing: 1.6, color: "#8ccfc1" }}>
              <span>DISRUPTION INPUT</span><span>ACTIVE</span>
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, marginTop: 18 }}>T-274 unavailable</div>
            <div style={{ fontSize: 16, color: "#aac0bb", marginTop: 8 }}>7 customer promises exposed</div>
          </div>

          <div style={{ display: "flex", gap: 12, padding: "20px 24px 0" }}>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "16px", borderRadius: 14, background: "#eef8f5", border: "1px solid #c8dfd9" }}>
              <div style={{ fontSize: 13, color: "#657f79" }}>Feasible moves</div>
              <div style={{ fontSize: 30, fontWeight: 800, marginTop: 6 }}>5</div>
            </div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "16px", borderRadius: 14, background: "#eef8f5", border: "1px solid #c8dfd9" }}>
              <div style={{ fontSize: 13, color: "#657f79" }}>Callbacks</div>
              <div style={{ fontSize: 30, fontWeight: 800, marginTop: 6 }}>2</div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", margin: "20px 24px 24px", padding: "15px", borderRadius: 14, background: "#138b76", color: "#ffffff", fontSize: 16, fontWeight: 800 }}>
            Manager approval required
          </div>
        </div>
      </div>
    </div>,
    size,
  );
}
