const multer = require("multer");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const fsPromises = require("fs").promises;
const fs = require("fs"); // For sync operations

/**
 * Configuration for a single upload field.
 * @typedef {object} FieldConfig
 * @property {string} name - The name attribute of the form field.
 * @property {string[]} allowedTypes - Array of allowed MIME types (e.g., 'image/jpeg', 'application/pdf').
 * @property {number} maxSize - Maximum file size in bytes.
 */

/**
 * Creates Multer middleware with integrated validation and cleanup capability.
 * Files for each field are stored in separate subdirectories following the pattern:
 * <uploadDir>/<moduleName>/<fieldname>/<uuid>/<filename>
 * Attaches `req.uploadErrors` (object) and `req.cleanupUpload` (function) to the request object.
 *
 * @param {string} moduleName - The name of the module this upload belongs to (used for directory structure).
 * @param {FieldConfig[]} fields - An array of field configurations.
 * @param {string} [uploadDir='uploads'] - The base directory for uploads.
 * @returns {Function[]} Array of Express middleware functions.
 */
const createUploadMiddleware = (moduleName, fields, uploadDir = "uploads") => {
  // Create a storage object for multer
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      // Get the field name (e.g., profilePicture)
      const fieldName = file.fieldname;
      // Generate a UUID for this upload
      const uuid = uuidv4();
      // Store the UUID on the request for later use
      req.fileUUID = req.fileUUID || {};
      req.fileUUID[fieldName] = uuid;
      // Construct the full path: uploads/members/profilePicture/UUID/
      const fullPath = path.join(uploadDir, moduleName, fieldName, uuid);
      console.log(`[UploadMiddleware] Destination for module '${moduleName}', field '${fieldName}': ${fullPath}`); // DEBUG LINE

      // Create directory if it doesn't exist
      fs.mkdirSync(fullPath, { recursive: true });
      cb(null, fullPath);
    },
    filename: (req, file, cb) => {
      // Use the original filename
      const filename = file.originalname;
      cb(null, filename);
    },
  });

  // --- Input Validation ---
  if (typeof moduleName !== "string" || moduleName.trim() === "") {
    throw new Error("Invalid moduleName provided. Must be a non-empty string.");
  }
  // Basic sanitization for moduleName to prevent path traversal issues
  const safeModuleName = moduleName.replace(/[^a-zA-Z0-9_-]/g, "_");
  if (safeModuleName !== moduleName) {
    console.warn(
      `Original moduleName "${moduleName}" sanitized to "${safeModuleName}" for directory usage.`,
    );
  }
  moduleName = safeModuleName; // Use the sanitized version

  if (!Array.isArray(fields) || fields.length === 0) {
    throw new Error("Field configuration array is required.");
  }

  const fieldsConfig = fields.reduce((acc, field) => {
    if (
      !field ||
      typeof field.name !== "string" ||
      !Array.isArray(field.allowedTypes) ||
      typeof field.maxSize !== "number"
    ) {
      throw new Error(
        `Invalid configuration for field: ${JSON.stringify(
          field,
        )}. Ensure 'name' (string), 'allowedTypes' (array), and 'maxSize' (number) are provided.`,
      );
    }
    acc[field.name] = {
      types: field.allowedTypes,
      maxSize: field.maxSize,
    };
    return acc;
  }, {});

  const multerFields = fields.map((field) => ({ name: field.name }));

  // --- Helper Function for Cleanup (Cleans *this request's* uploads across all relevant field directories) ---
  async function cleanupRequestUploads(req) {
    // Use moduleName and uploadDir from the closure of createUploadMiddleware.
    // req.fileUUID is populated by the storage engine or initialized by the setup middleware.
    const fileUUIDsMap = req.fileUUID || {};

    console.log(
      `[Cleanup] Attempting cleanup for module '${moduleName}'. UUIDs found: ${JSON.stringify(fileUUIDsMap)}`,
    );

    let cleanupFailed = false;

    // Iterate through the fields defined for *this* middleware instance
    for (const field of fields) {
      const fieldname = field.name;
      const uuidForThisField = fileUUIDsMap[fieldname];

      if (!uuidForThisField) {
        // No file was uploaded for this field in this request, or UUID not recorded.
        // So, no specific UUID-based directory to clean for this field.
        console.log(`[Cleanup] No UUID found for field '${fieldname}'. Skipping its specific path cleanup.`);
        continue;
      }

      // Construct the specific directory path for this field and its UUID for this request
      const targetDir = path.join(
        uploadDir,       // From closure
        moduleName,      // From closure (sanitized version)
        fieldname,
        uuidForThisField // The UUID specific to this field for this request
      );

      try {
        // Check if the directory potentially exists before trying to remove it
        // Although fs.rm with force:true handles non-existence, this avoids unnecessary logs/attempts
        // For atomicity, fs.rm is still preferred over manual readdir/unlink/rmdir
        // Let fs.rm handle the recursive removal if it exists.

        // Use fs.rm with recursive option to remove the UUID directory and its contents for this field
        await fsPromises.rm(targetDir, { recursive: true, force: true }); // force:true suppresses ENOENT errors
        console.log(
          `[Cleanup] Successfully checked/removed directory: ${targetDir}`,
        );
      } catch (err) {
        // Even with force:true, other errors (like permissions) might occur.
        console.error(
          `[Cleanup] Failed to remove directory ${targetDir}:`,
          err,
        );
        cleanupFailed = true;
      }
    }

    if (cleanupFailed) {
      // Optional: Add a general cleanup error if any part failed
      req.uploadErrors = req.uploadErrors || {};
      req.uploadErrors["general"] = req.uploadErrors["general"] || [];
      if (
        !req.uploadErrors["general"].some((e) => e.type === "cleanup_error")
      ) {
        req.uploadErrors["general"].push({
          type: "cleanup_error",
          message:
            "One or more upload directories could not be fully cleaned up.",
        });
      }
    }

    // Clear related properties on req (optional, depends on downstream needs)
    // req.files = null;
    // req.fileUUID = null; // Keep for logging?
  }

  // This middleware function is added to the chain. It ensures req.fileUUID exists
  // and attaches the cleanupUpload function to the request.
  const setupCleanup = (req, res, next) => {
    const logPrefix = `[SetupCleanup:${req.fileUUID && Object.keys(req.fileUUID).length > 0 ? 'UUIDsPresent' : 'NoUUIDs'}]`;
    console.log(`${logPrefix} Start setup. Initial req.fileUUID:`, req.fileUUID);
    req.fileUUID = req.fileUUID || {}; // Ensure req.fileUUID is initialized

    // Attach the cleanup function to the request
    req.cleanupUpload = async () => {
      console.log(`${logPrefix} cleanupUpload() called.`);
      await cleanupRequestUploads(req);
    };
    console.log(`${logPrefix} cleanupUpload attached. Calling next().`);
    next();
  };

  // --- Multer Instance ---
  const upload = multer({
    storage: storage,
    // Limits check is done after upload in validation middleware
  });

  // --- Validation Middleware (Async Ready - No changes needed here) ---
  const validateFiles = async (req, res, next) => {
    const logPrefix = `[ValidateFiles:${req.fileUUID && Object.keys(req.fileUUID).length > 0 ? 'UUIDsPresent' : 'NoUUIDs'}]`;
    console.log(`${logPrefix} Start validation. req.files:`, req.files);

    req.uploadErrors = req.uploadErrors || {};
    let hasValidationErrors = false;

    // Validate files against the configuration for expected fields
    for (const fieldConfig of fields) {
      const fieldname = fieldConfig.name;
      const config = fieldsConfig[fieldname]; // Get config from the map created earlier
      const uploadedFiles = req.files[fieldname] || []; // Get files for this field

      // This check should not be necessary if using upload.fields correctly,
      // but kept for robustness against unexpected req.files structure.
      // if (!config) {
      //     // This case means a field was uploaded that wasn't in the initial fields array
      //     // Multer's .fields() should prevent this, but handle defensively.
      //     if (uploadedFiles.length > 0) {
      //         req.uploadErrors[fieldname] = req.uploadErrors[fieldname] || [];
      //         req.uploadErrors[fieldname].push({
      //             type: 'unexpected_field',
      //             message: `Unexpected file field received (should have been handled by Multer): ${fieldname}`
      //         });
      //         hasValidationErrors = true;
      //     }
      //     continue; // Skip validation for unexpected fields
      // }

      for (const file of uploadedFiles) {
        const fileMimeType = file.mimetype;

        // 1. Type Validation
        if (config && !config.types.includes(fileMimeType)) {
          hasValidationErrors = true;
          req.uploadErrors[fieldname] = req.uploadErrors[fieldname] || [];
          req.uploadErrors[fieldname].push({
            type: "invalid_type",
            message: `Invalid file type for field '${fieldname}'. Allowed: ${config.types.join(
              ", ",
            )}. Received: ${fileMimeType || "N/A"}`,
            filename: file.originalname,
            receivedType: fileMimeType,
          });
        }

        // 2. Size Validation
        if (config && file.size > config.maxSize) {
          hasValidationErrors = true;
          req.uploadErrors[fieldname] = req.uploadErrors[fieldname] || [];
          req.uploadErrors[fieldname].push({
            type: "invalid_size",
            message: `File too large for field '${fieldname}'. Max size: ${(
              config.maxSize /
              1024 /
              1024
            ).toFixed(2)} MB. Received: ${(file.size / 1024 / 1024).toFixed(
              2,
            )} MB`,
            filename: file.originalname,
            maxSize: config.maxSize,
            receivedSize: file.size,
          });
        }
      }
    }

    // Check for fields present in req.files but *not* in the configured fields
    // Multer's `.fields()` middleware typically prevents extra fields from appearing
    // in `req.files` unless maybe configured differently, but this check adds safety.
    for (const receivedFieldname in req.files) {
      if (!fieldsConfig[receivedFieldname]) {
        req.uploadErrors[receivedFieldname] =
          req.uploadErrors[receivedFieldname] || [];
        // Avoid adding duplicate messages if already added above
        if (
          !req.uploadErrors[receivedFieldname].some(
            (e) => e.type === "unexpected_field",
          )
        ) {
          req.uploadErrors[receivedFieldname].push({
            type: "unexpected_field",
            message: `Unexpected file field found in request files object: ${receivedFieldname}`,
          });
        }
        hasValidationErrors = true;
      }
    }

    // --- Cleanup Logic (within validation) ---
    if (hasValidationErrors) {
      console.log(`${logPrefix} Validation errors detected. Errors:`, req.uploadErrors);
      // Potentially trigger cleanup earlier if validation fails and files were partially processed by multer
      // However, cleanup is also handled in controller if DB ops fail.
      // For now, just log. Controller will handle response.
    } else {
      console.log(`${logPrefix} No validation errors found.`);
    }
    console.log(`${logPrefix} Calling next().`);
    next();
  };

  // --- Multer Error Handler Middleware (No changes needed here conceptually) ---
  const handleMulterErrors = (err, req, res, next) => {
    req.uploadErrors = req.uploadErrors || {};
    const requestUUID = "N/A"; // Use UUID for logging if available

    if (err instanceof multer.MulterError) {
      console.error(`[Multer Error:${requestUUID}]`, err);
      const field = err.field || "general"; // Use 'general' if field is not specified
      req.uploadErrors[field] = req.uploadErrors[field] || [];
      req.uploadErrors[field].push({
        type: `multer_${err.code.toLowerCase()}`,
        message: err.message,
        code: err.code,
        field: err.field,
      });

      // Trigger cleanup if the function exists on the request
      if (req.cleanupUpload) {
        req
          .cleanupUpload(req) // Call cleanup
          .catch((cleanupErr) => {
            console.error(
              `[Multer Error:${requestUUID}] Error during cleanup after Multer error:`,
              cleanupErr,
            );
            req.uploadErrors["general"] = req.uploadErrors["general"] || [];
            if (
              !req.uploadErrors["general"].some(
                (e) => e.type === "cleanup_error",
              )
            ) {
              req.uploadErrors["general"].push({
                type: "cleanup_error",
                message:
                  "Failed to cleanup temporary upload files after Multer error.",
              });
            }
          })
          .finally(() => {
            next(); // Proceed even if cleanup failed, errors are recorded
          });
      } else {
        console.warn(
          `[Multer Error:${requestUUID}] req.cleanupUpload not found when handling Multer error.`,
        );
        next();
      }
    } else if (err) {
      // Handle other unexpected errors during Multer processing/setup (e.g., disk errors before handler)
      console.error(`[Upload Setup Error:${requestUUID}]`, err);
      req.uploadErrors["general"] = req.uploadErrors["general"] || [];
      req.uploadErrors["general"].push({
        type: "upload_setup_error",
        message:
          err.message || "An unexpected error occurred during upload setup.",
        error: err.toString(), // Avoid sending full error object in production response potentially
      });

      // Trigger cleanup if possible
      if (req.cleanupUpload) {
        req
          .cleanupUpload(req)
          .catch((cleanupErr) => {
            console.error(
              `[Upload Setup Error:${requestUUID}] Error during cleanup after setup error:`,
              cleanupErr,
            );
            req.uploadErrors["general"] = req.uploadErrors["general"] || [];
            if (
              !req.uploadErrors["general"].some(
                (e) => e.type === "cleanup_error",
              )
            ) {
              req.uploadErrors["general"].push({
                type: "cleanup_error",
                message:
                  "Failed to cleanup temporary upload files after setup error.",
              });
            }
          })
          .finally(() => {
            next();
          });
      } else {
        console.warn(
          `[Upload Setup Error:${requestUUID}] req.cleanupUpload not found when handling setup error.`,
        );
        next();
      }
    } else {
      next(); // No error
    }
  };

  // --- Return the sequence of middleware functions ---
  const multerMiddleware = upload.fields(multerFields);

  return [
    // 1. Initial Setup Middleware (Synchronous)
    // Removed

    // 2. Multer Middleware (Handles actual upload based on storage config)
    (req, res, next) => {
      const requestUUID = "N/A"; // Grab for logging context
      console.log(
        `[Multer Start:${requestUUID}] Applying Multer middleware...`,
      );
      multerMiddleware(req, res, (err) => {
        // This callback catches errors *from* the multer processing (like limits before file save completion, disk errors)
        if (err) {
          console.log(
            `[Multer Error Caught:${requestUUID}] Passing error to Multer error handler.`,
          );
          // Pass the error to our dedicated handler
          return handleMulterErrors(err, req, res, next);
        }
        // Multer succeeded (files are on disk temporarily)
        console.log(
          `[Multer Success:${requestUUID}] Multer finished processing. Files on req:`,
          req.files
            ? Object.keys(req.files)
                .map((k) => `${k}: ${req.files[k].length}`)
                .join(", ")
            : "None",
        );
        // Log the actual file paths for verification
        if (req.files) {
          Object.values(req.files)
            .flat()
            .forEach((f) => console.log(` -> Uploaded Temp: ${f.path}`));
        }
        // Proceed to custom validation
        next();
      });
    },

    // 3. Custom Validation Middleware (Async - checks type/size after upload)
    validateFiles,

    // 4. Final Multer Error Handler Middleware (Catches errors passed from Multer's callback)
    // Note: handleMulterErrors is *called* by the Multer middleware callback on error,
    // so it doesn't need to be explicitly listed again here unless you want it
    // to catch errors from `validateFiles` *as well*, which might be confusing.
    // It's better placed where it is, invoked directly by the multer callback.
    // We might add a final *general* error handler for the route later if needed.

    // Added setupCleanup middleware
    setupCleanup,
  ];
};

module.exports = createUploadMiddleware;
