const express = require('express');
const router = express.Router();
const {
  getPublicDepotVariantsByProduct,
  getAllPublicDepotVariants,
  getPublicDepotVariantsByDepot,
} = require('../../controllers/public/depotVariantsController');

/**
 * @swagger
 * components:
 *   schemas:
 *     DepotVariant:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           example: "123"
 *         name:
 *           type: string
 *           example: "Fresh Cow Milk - 500ml"
 *         price:
 *           type: number
 *           example: 55
 *         rate:
 *           type: number
 *           example: 55
 *         buyOncePrice:
 *           type: number
 *           example: 55
 *         price3Day:
 *           type: number
 *           example: 50
 *         price15Day:
 *           type: number
 *           example: 48
 *         price1Month:
 *           type: number
 *           example: 45
 *         unit:
 *           type: string
 *           example: "500ml"
 *         depot:
 *           type: object
 *           properties:
 *             id:
 *               type: integer
 *               example: 1
 *             name:
 *               type: string
 *               example: "Main Depot"
 *             isOnline:
 *               type: boolean
 *               example: true
 *         product:
 *           type: object
 *           properties:
 *             id:
 *               type: integer
 *               example: 1
 *             name:
 *               type: string
 *               example: "Fresh Cow Milk"
 */

/**
 * @swagger
 * tags:
 *   name: Public Depot Variants
 *   description: Public depot variant APIs (no authentication required)
 */

/**
 * @swagger
 * /api/public/depot-variants:
 *   get:
 *     summary: Get all depot variants with optional filtering
 *     tags: [Public Depot Variants]
 *     parameters:
 *       - in: query
 *         name: depotId
 *         schema:
 *           type: integer
 *         description: Filter by depot ID
 *       - in: query
 *         name: productId
 *         schema:
 *           type: integer
 *         description: Filter by product ID
 *     responses:
 *       200:
 *         description: Successfully retrieved depot variants
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       depot:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                           name:
 *                             type: string
 *                           isOnline:
 *                             type: boolean
 *                       products:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             product:
 *                               type: object
 *                             variants:
 *                               type: array
 *                               items:
 *                                 $ref: '#/components/schemas/DepotVariant'
 *                 total:
 *                   type: integer
 *       500:
 *         description: Server error
 */
router.get('/', getAllPublicDepotVariants);

/**
 * @swagger
 * /api/public/depot-variants/{productId}:
 *   get:
 *     summary: Get depot variants for a specific product
 *     tags: [Public Depot Variants]
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema:
 *           type: integer
 *         description: The product ID
 *       - in: query
 *         name: depotId
 *         schema:
 *           type: integer
 *         description: Filter by depot ID
 *     responses:
 *       200:
 *         description: Successfully retrieved depot variants for the product
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/DepotVariant'
 *                 total:
 *                   type: integer
 *       400:
 *         description: Invalid product ID
 *       500:
 *         description: Server error
 */
router.get('/:productId', getPublicDepotVariantsByProduct);

/**
 * @swagger
 * /api/public/depots/{depotId}/variants:
 *   get:
 *     summary: Get all variants for a specific depot
 *     tags: [Public Depot Variants]
 *     parameters:
 *       - in: path
 *         name: depotId
 *         required: true
 *         schema:
 *           type: integer
 *         description: The depot ID
 *       - in: query
 *         name: productId
 *         schema:
 *           type: integer
 *         description: Filter by product ID
 *     responses:
 *       200:
 *         description: Successfully retrieved depot variants
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     depot:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                         name:
 *                           type: string
 *                         isOnline:
 *                           type: boolean
 *                     variants:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/DepotVariant'
 *                 total:
 *                   type: integer
 *       400:
 *         description: Invalid depot ID
 *       500:
 *         description: Server error
 */
router.get('/depots/:depotId/variants', getPublicDepotVariantsByDepot);

module.exports = router;
