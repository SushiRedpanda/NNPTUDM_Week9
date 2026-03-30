var express = require("express");
var router = express.Router();
let messageModel = require("../schemas/messages");
let { checkLogin } = require("../utils/authHandler.js");
let { uploadImage } = require("../utils/uploadHandler.js");
const mongoose = require("mongoose");

// 3. GET / : lấy message cuối cùng của mỗi user mà user hiện tại nhắn tin hoặc user khác nhắn cho user hiện tại
router.get("/", checkLogin, async function (req, res, next) {
    try {
        let currentUserId = new mongoose.Types.ObjectId(req.userId);

        let latestMessages = await messageModel.aggregate([
            {
                $match: {
                    $or: [
                        { from: currentUserId },
                        { to: currentUserId }
                    ]
                }
            },
            {
                $sort: { createdAt: -1 }
            },
            {
                $addFields: {
                    partnerId: {
                        $cond: {
                            if: { $eq: ["$from", currentUserId] },
                            then: "$to",
                            else: "$from"
                        }
                    }
                }
            },
            {
                $group: {
                    _id: "$partnerId",
                    latestMessage: { $first: "$$ROOT" }
                }
            },
            {
                $replaceRoot: { newRoot: "$latestMessage" }
            },
            {
                $sort: { createdAt: -1 } 
            }
        ]);

        let populatedResult = await messageModel.populate(latestMessages, [
            { path: "from", select: "username email avatarUrl" },
            { path: "to", select: "username email avatarUrl" }
        ]);

        res.status(200).send(populatedResult);
    } catch (err) {
        res.status(400).send({ message: err.message });
    }
});

// 1. GET /:userID - ( lấy toàn toàn bộ message from: user hiện tại, to :userID và from: userID và to:user hiện tại )
router.get("/:userID", checkLogin, async function (req, res, next) {
    try {
        let currentUserId = req.userId;
        let targetUserId = req.params.userID;
        
        let messages = await messageModel.find({
            $or: [
                { from: currentUserId, to: targetUserId },
                { from: targetUserId, to: currentUserId }
            ]
        }).sort({ createdAt: 1 }) // Sắp xếp theo thứ tự thời gian tăng dần (từ cũ đến mới)
          .populate('from', 'username email avatarUrl')
          .populate('to', 'username email avatarUrl');
          
        res.status(200).send(messages);
    } catch (err) {
        res.status(400).send({ message: err.message });
    }
});

// 2. POST / : post nội dung bao gồm file hoặc text, gửi đến to: userID
router.post("/", checkLogin, uploadImage.single('file'), async function (req, res, next) {
    try {
        let currentUserId = req.userId;
        let toUserId = req.body.to;
        
        if (!toUserId) {
            return res.status(400).send({ message: "Thiếu thông tin người nhận: to" });
        }

        let msgType = "text";
        let msgText = req.body.text; 

        // Nếu có chứa file thì type là file, text là path dẫn đến file
        if (req.file) {
            msgType = "file";
            msgText = req.file.path.replace(/\\/g, '/');
        } else {
            if (!msgText) {
                return res.status(400).send({ message: "Thiếu nội dung tin nhắn." });
            }
            msgType = "text";
        }

        let newMessage = new messageModel({
            from: currentUserId,
            to: toUserId,
            messageContent: {
                type: msgType,
                text: msgText
            }
        });

        let result = await newMessage.save();
        let populatedResult = await messageModel.populate(result, [
            { path: "from", select: "username email avatarUrl" },
            { path: "to", select: "username email avatarUrl" }
        ]);

        res.status(201).send(populatedResult);
    } catch (err) {
        res.status(400).send({ message: err.message });
    }
});

module.exports = router;
