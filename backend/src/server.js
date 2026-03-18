require("dotenv").config();
const http = require("http");
const app = require("./app");
const connectDB = require("./config/db");
const socketUtils = require("./socket");

connectDB();

const server = http.createServer(app);
socketUtils.init(server);

const PORT = process.env.PORT || 5005;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));