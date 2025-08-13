import express, { Application } from "express";
import defaultRoute from "./routes/default";

const app: Application = express();
const port: number = parseInt(process.env.PORT) || 4131;
const host: string = process.env.HOST || "localhost"; // Add this line

app.set("views", "views");
app.set("view engine", "pug");

app.use(express.static("public"));
app.use(defaultRoute);

// Modified listen call with both host and port
app.listen(port, host, () => {
    console.log(`App started on ${host}:${port}`);
});
