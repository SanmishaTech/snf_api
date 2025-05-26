const createError = require("http-errors");
const { z } = require("zod");
const path = require("path");

/**
 * Validate request data against a schema
 * @param {z.Schema} schema - Zod schema to validate against
 * @param {Object} data - Request data to validate
 * @param {Object} files - Request files (optional)
 * @returns {Object|null} Validated data or null if validation fails
 */
const validateRequest = async (schema, data, files = {}) => {
  try {
    // Convert number strings to actual numbers for specified fields
    const parsedData = { ...data };

    // Handle numeric fields that might come as strings
    if (parsedData.chapterId) {
      parsedData.chapterId = Number(parsedData.chapterId);
    }

    // Clean up empty profile picture objects from JSON data
    ["profilePicture", "coverPhoto", "logo"].forEach(
      (field) => {
        if (parsedData[field] && Object.keys(parsedData[field]).length === 0) {
          delete parsedData[field];
        }
      }
    );

    // Handle file uploads if present
    if (files) {
      ["profilePicture", "coverPhoto", "logo"].forEach(
        (field) => {
          if (files[field] && files[field][0]) {
            // Get the UUID from the file path
            const pathParts = files[field][0].path.split(path.sep);
            const uuid = pathParts[pathParts.indexOf(field) + 1];

            // Construct the relative path that matches the URL structure
            const relativePath = path
              .join("uploads", "members", field, uuid, files[field][0].filename)
              .replace(/\\/g, "/"); // Ensure forward slashes for URLs

            parsedData[field] = relativePath;
          }
        }
      );
    }

    const validatedData = await schema.parseAsync(parsedData);
    return validatedData;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const fieldErrors = {};
      error.errors.forEach((err) => {
        fieldErrors[err.path[0]] = {
          type: "server",
          message: err.message,
        };
      });
      return { errors: fieldErrors };
    }
    throw error;
  }
};

module.exports = validateRequest;