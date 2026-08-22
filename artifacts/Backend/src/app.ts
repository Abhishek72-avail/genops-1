import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import session from "express-session";
import path from "node:path";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.set("trust proxy", 1);
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: process.env.SESSION_SECRET ?? "gms-dev-secret-2024",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      // secure: process.env.NODE_ENV === "production",
      // sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      // COOKIE_SECURE=false for local Docker (HTTP), true only for HTTPS production
      secure: process.env.COOKIE_SECURE === "true",
      sameSite: process.env.COOKIE_SECURE === "true" ? "none" : "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    },
  }),
);

app.use("/api", router);

if (process.env.NODE_ENV === "production") {
  const publicPath = path.resolve(__dirname, "../../Frontend/dist/public");
  app.use(express.static(publicPath));
  // app.get("*", (req, res) => {
  app.get("/{*splat}", (req, res) => {
    if (req.originalUrl.startsWith("/api")) {
      res.status(404).json({ error: "Not Found" });
      return;
    }
    res.sendFile(path.resolve(publicPath, "index.html"));
  });
}

export default app;
