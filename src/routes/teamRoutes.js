const express = require("express");
const router = express.Router();
const { createUser, assignDepot, getUsers, deleteUser, updateUser, toggleUserStatus } = require('../controllers/teamController');

router.post("/users", createUser);
router.put('/assign', assignDepot);
router.patch('/users/:id', updateUser);
router.delete('/users/:id', deleteUser);
router.get("/users", getUsers);
router.patch('/users/:id/status', toggleUserStatus);

module.exports = router;
