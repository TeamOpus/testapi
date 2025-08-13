import express, { Application } from "express";
import defaultRoute from "./routes/default";

const app: Application = express();
const port: number = parseInt(process.env.PORT) || 4131;
const host: string = process.env.HOST || "69.62.84.40"; // Your custom IP

app.set("views", "views");
app.set("view engine", "pug");

app.use(express.static("public"));
app.use(defaultRoute);

// Update the listen call and console.log
app.listen(port, host, () => {
    console.log(`App started on ${host}:${port}`);
});
