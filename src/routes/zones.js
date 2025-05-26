/**
 * Express Router configuration for Zone management endpoints.
 *
 * This file defines the routes for handling CRUD operations on zones,
 * including fetching, creating, updating, and deleting zones.
 * It utilizes authentication and access control list (ACL) middleware
 * to secure the endpoints and includes Swagger documentation annotations.
 *
 * @module routes/zoneRoutes
 */

const express = require("express");
const router = express.Router();
const zoneController = require("../controllers/zonesController");
const auth = require("../middleware/auth");
const acl = require("../middleware/acl");

/**
 * @swagger
 * tags:
 *   name: Zones
 *   description: Zone management endpoints
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     Zone:
 *       type: object
 *       required:
 *         - name
 *       properties:
 *         id:
 *           type: integer
 *           description: The auto-generated id of the zone
 *           example: 1
 *         name:
 *           type: string
 *           description: The name of the zone
 *           example: "North Zone"
 *         createdAt:
 *           type: string
 *           format: date-time
 *           description: The date and time the zone was created
 *           example: "2023-10-27T10:00:00.000Z"
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           description: The date and time the zone was last updated
 *           example: "2023-10-27T10:00:00.000Z"
 *     ZoneListResponse:
 *       type: object
 *       properties:
 *         totalZones:
 *           type: integer
 *           description: Total number of zones matching the query
 *         page:
 *           type: integer
 *           description: Current page number
 *         totalPages:
 *           type: integer
 *           description: Total number of pages available
 *         zones:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/Zone'
 */

/**
 * @swagger
 * /zones:
 *   get:
 *     summary: Retrieve a list of zones
 *     tags: [Zones]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of zones per page
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search term for zone name
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           default: id
 *         description: Field to sort by (e.g., 'id', 'name', 'createdAt')
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: asc
 *         description: Sort order
 *       - in: query
 *         name: export
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Set to true to export zone data
 *     responses:
 *       200:
 *         description: A list of zones
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ZoneListResponse'
 *       401:
 *         description: Unauthorized - Invalid or missing authentication token
 *       403:
 *         description: Forbidden - User does not have permission ('zones.read')
 *
 *   post:
 *     summary: Create a new zone
 *     tags: [Zones]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 description: The name for the new zone. Must be unique
 *     responses:
 *       201:
 *         description: Zone created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Zone'
 *       400:
 *         description: Bad Request - Invalid input
 *       401:
 *         description: Unauthorized - Invalid or missing authentication token
 *       403:
 *         description: Forbidden - User does not have permission ('zones.write')
 */
// router.get("/", auth, zoneController.getZones);
router.post("/", auth, zoneController.createZone);

/**
 * @swagger
 * /zones/{id}:
 *   get:
 *     summary: Get a zone by its ID
 *     tags: [Zones]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: integer
 *         required: true
 *         description: Numeric ID of the zone to retrieve
 *     responses:
 *       200:
 *         description: Zone data retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Zone'
 *       401:
 *         description: Unauthorized - Invalid or missing authentication token
 *       403:
 *         description: Forbidden - User does not have permission ('zones.read')
 *       404:
 *         description: Not Found - Zone with the specified ID does not exist
 *
 *   put:
 *     summary: Update a zone by its ID
 *     tags: [Zones]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: integer
 *         required: true
 *         description: Numeric ID of the zone to update
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 description: The updated name for the zone. Must be unique
 *     responses:
 *       200:
 *         description: Zone updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Zone'
 *       400:
 *         description: Bad Request - Invalid input
 *       401:
 *         description: Unauthorized - Invalid or missing authentication token
 *       403:
 *         description: Forbidden - User does not have permission ('zones.write')
 *       404:
 *         description: Not Found - Zone with the specified ID does not exist
 *
 *   delete:
 *     summary: Delete a zone by its ID
 *     tags: [Zones]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: integer
 *         required: true
 *         description: Numeric ID of the zone to delete
 *     responses:
 *       200:
 *         description: Zone deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Zone deleted successfully"
 *       401:
 *         description: Unauthorized - Invalid or missing authentication token
 *       403:
 *         description: Forbidden - User does not have permission ('zones.delete')
 *       404:
 *         description: Not Found - Zone with the specified ID does not exist
 */
router.get("/:id", auth, zoneController.getZoneById);
router.put("/:id", auth, zoneController.updateZone);
router.delete("/:id", auth, zoneController.deleteZone);

/**
 * @swagger
 * /zones/{zoneId}/chapters:
 *   get:
 *     summary: Retrieve chapters for a specific zone
 *     tags: [Zones]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: zoneId
 *         schema:
 *           type: integer
 *         required: true
 *         description: Numeric ID of the zone to retrieve chapters for
 *     responses:
 *       200:
 *         description: A list of chapters for the specified zone
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 chapters:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       name:
 *                         type: string
 *                   example:
 *                     - id: 1
 *                       name: "Chapter Alpha"
 *                     - id: 2
 *                       name: "Chapter Beta"
 *       400:
 *         description: Invalid Zone ID provided
 *       401:
 *         description: Unauthorized - Invalid or missing authentication token
 *       403:
 *         description: Forbidden - User does not have permission ('zones.read')
 *       404:
 *         description: Not Found - Zone with the specified ID does not exist
 *       500:
 *         description: Internal Server Error
 */
router.get(
  "/:zoneId/chapters",
  auth,
   zoneController.getChaptersByZone
);

/**
 * @swagger
 * /zones/{zoneId}/roles:
 *   get:
 *     summary: Get all roles for a specific zone
 *     tags: [Zones]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: zoneId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the zone
 *     responses:
 *       200:
 *         description: A list of zone roles
 *       400:
 *         description: Invalid Zone ID
 *       401:
 *         description: Unauthorized
 */
router.get("/:zoneId/roles", auth, zoneController.getZoneRoles);

/**
 * @swagger
 * /zones/{zoneId}/roles:
 *   post:
 *     summary: Assign a role to a member in a zone
 *     tags: [Zones]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: zoneId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the zone
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - memberId
 *               - roleType
 *             properties:
 *               memberId:
 *                 type: integer
 *               roleType:
 *                 type: string
 *                 enum: ["Regional Director", "Joint Secretary"]
 *     responses:
 *       201:
 *         description: Zone role assigned successfully
 *       400:
 *         description: Invalid input (Zone ID, Member ID, or RoleType)
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Zone or Member not found
 */
router.post("/:zoneId/roles", auth, zoneController.assignZoneRole);

/**
 * @swagger
 * /zones/roles/{assignmentId}:
 *   delete:
 *     summary: Remove a zone role assignment
 *     tags: [Zones]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: assignmentId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the zone role assignment to remove
 *     responses:
 *       200:
 *         description: Zone role removed successfully
 *       400:
 *         description: Invalid Assignment ID
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Zone role assignment not found
 */
router.delete("/roles/:assignmentId", auth, zoneController.removeZoneRole);

module.exports = router;
