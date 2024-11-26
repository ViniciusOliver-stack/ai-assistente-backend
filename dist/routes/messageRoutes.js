"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createMessageRouter = createMessageRouter;
const express_1 = require("express");
const messageController_1 = require("../controllers/messageController");
function createMessageRouter(socketService) {
    const router = (0, express_1.Router)();
    const messageController = new messageController_1.MessageController(socketService);
    router.post('/', (req, res) => messageController.createMessage(req, res));
    router.get('/undelivered/:userId', (req, res) => messageController.getUndeliveredMessages(req, res));
    return router;
}
