const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const { z } = require("zod");
const prisma = require("../config/db");
const emailService = require("../services/emailService");
const validateRequest = require("../utils/validateRequest");
const config = require("../config/config");
const jwtConfig = require("../config/jwt"); // Corrected: Get secret and expiresIn from here
const createError = require("http-errors");

const POLICY_TEXT_KEY = "policy"; // Changed to 'policy' for consistency

// Helper function to get user's chapter roles
 
/**
 * Get chapters accessible by user based on their roles
 * Groups chapters by role categories:
 * - OB: Office Bearers (chapterHead, secretary, treasurer)
 * - RD: Regional Directors (connected to zones)
 * - DC: Development Coordinators (districtCoordinator, guardian)
 * 
 * @param {string} userId - User ID to check roles for
 * @returns {Promise<Array>} Array containing role categories and accessible chapter IDs
 */
 

// Register a new user
const register = async (req, res, next) => {
  if (process.env.ALLOW_REGISTRATION !== "true") {
    return res
      .status(403)
      .json({ errors: { message: "Registration is disabled" } });
  }

  // Define Zod schema for registration validation
  const schema = z
    .object({
      name: z.string().nonempty("Name is required."),
      email: z
        .string()
        .email("Email must be a valid email address.")
        .optional(),
      password: z
        .string()
        .min(6, "Password must be at least 6 characters long.")
        .nonempty("Password is required."),
      role: z.enum(["VENDOR", "AGENCY", "ADMIN", "MEMBER"]).optional(), // Added optional role
      agreedToPolicy: z.boolean().optional(), // Add agreedToPolicy to schema
      mobile: z
        .string()
        .regex(/^\d{10}$/ , "Mobile must be a 10 digit number.")
        .optional(),
    })
    .refine((data) => data.email || data.mobile, {
      message: "Either email or mobile number is required.",
      path: ["email"],
    })
    .superRefine(async (data, ctx) => {
      if (data.email) {
        const existingUserByEmail = await prisma.user.findUnique({
          where: { email: data.email },
        });
        if (existingUserByEmail) {
          ctx.addIssue({
            path: ["email"],
            message: `User with email ${data.email} already exists.`,
          });
        }
      }
      if (data.mobile) {
        const existingUserByMobile = await prisma.user.findFirst({
          where: { mobile: data.mobile },
        });
        if (existingUserByMobile) {
          ctx.addIssue({
            path: ["mobile"],
            message: `User with mobile ${data.mobile} already exists.`,
          });
        }
      }
    });

  try {
    // Use the reusable validation function
    const validationErrors = await validateRequest(schema, req.body, res);
    const { name, email, password, role: requestedRole, mobile } = req.body; // Destructure requestedRole and mobile
    const hashedPassword = await bcrypt.hash(password, 10);

    // Determine user role, ensuring it's uppercase for Prisma enum compatibility
    // and maps to a valid Prisma Role enum value.
    let resolvedUserRole;
    const validPrismaRoles = ["VENDOR", "AGENCY", "ADMIN", "MEMBER"]; // Assumed valid roles from your schema

    if (requestedRole && validPrismaRoles.includes(requestedRole.toUpperCase())) {
      resolvedUserRole = requestedRole.toUpperCase();
    } else {
      const defaultRoleFromConfig = config.defaultUserRole.toUpperCase();
      if (defaultRoleFromConfig === "USER") { // If default was 'user' (common mistake) or 'USER'
        resolvedUserRole = "MEMBER"; // Map to a valid role like MEMBER
      } else if (validPrismaRoles.includes(defaultRoleFromConfig)) {
        resolvedUserRole = defaultRoleFromConfig;
      } else {
        // Fallback if the default role from config is not in validPrismaRoles and not 'USER'
        console.warn(`Unrecognized default role '${config.defaultUserRole}' from config, defaulting to MEMBER.`);
        resolvedUserRole = "MEMBER"; 
      }
    }

    const userData = {
      name,
      password: hashedPassword,
      role: resolvedUserRole, // Use the sanitized and validated role
      ...(email && { email }),
      ...(mobile && { mobile }),
    };

    // Check if user with this email already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });
    if (existingUser) {
      return res.status(409).json({ message: 'User with this email already exists' });
    }
    // Check if mobile number is already in use
    if (mobile) {
      const existingMobile = await prisma.user.findUnique({ where: { mobile } });
      if (existingMobile) {
        return res.status(409).json({ message: 'User with this mobile number already exists' });
      }
    }

    // If the user is a member, create a related Member record
    if (resolvedUserRole === 'MEMBER') {
      userData.member = {
        create: {
          name: name, // Use the registration name for Member.name
        },
      };
    }
    // TODO: Add similar blocks if VENDOR or AGENCY roles need linked records created upon registration

    const user = await prisma.user.create({
      data: userData,
    });

    res.status(201).json(user);
  } catch (error) {
    next(error);
  }
};

const login = async (req, res, next) => {
  console.log("[LOGIN_TRACE] Attempting login...");
  const schema = z.object({
    identifier: z.string().nonempty("Email or phone is required"),
    password: z.string().nonempty("Password is required"),
  });

  try {
    console.log("[LOGIN_TRACE] Validating request body...");
    // const validationResult = await validateRequest(schema, req.body, res);

    // if(validateRequest){
    //   res.status(401).json(validationResult);
    // }
    
    // console.log("[LOGIN_TRACE] Validation successful.");

    // Access the actual validated data from the .data property
    // const validatedData = validationResult.data; 
    const { identifier, password } = req.body; // Now email and password should be correctly destructured

    console.log(`[LOGIN_TRACE] Attempting to fetch user: ${identifier}`);
    let user;
    if (identifier.includes("@")) {
      // Email login - check User table email field first
      user = await prisma.user.findUnique({ where: { email: identifier } });
      
      // If not found in User table, check role-specific tables for email
      if (!user) {
        console.log(`[LOGIN_TRACE] User not found in User table, checking role-specific tables for email: ${identifier}`);
        
        // Check Vendor table
        const vendor = await prisma.vendor.findFirst({
          where: { email: identifier },
          include: { user: true }
        });
        if (vendor) {
          user = vendor.user;
          console.log(`[LOGIN_TRACE] User found via Vendor email: ${user.id}`);
        }
        
        // Check Agency table if not found in Vendor
        if (!user) {
          const agency = await prisma.agency.findFirst({
            where: { email: identifier },
            include: { user: true }
          });
          if (agency) {
            user = agency.user;
            console.log(`[LOGIN_TRACE] User found via Agency email: ${user.id}`);
          }
        }
        
        // Check Supervisor table if not found in Agency
        if (!user) {
          const supervisor = await prisma.supervisor.findFirst({
            where: { email: identifier },
            include: { user: true }
          });
          if (supervisor) {
            user = supervisor.user;
            console.log(`[LOGIN_TRACE] User found via Supervisor email: ${user.id}`);
          }
        }
        
        // Note: Depot table doesn't have email field, only contactNumber
      }
    } else {
      // Mobile login - check User table mobile field first
      user = await prisma.user.findFirst({ where: { mobile: identifier } });
      
      // If not found in User table, check role-specific tables
      if (!user) {
        console.log(`[LOGIN_TRACE] User not found in User table, checking role-specific tables for mobile: ${identifier}`);
        
        // Check Vendor table
        const vendor = await prisma.vendor.findFirst({
          where: { mobile: identifier },
          include: { user: true }
        });
        if (vendor) {
          user = vendor.user;
          console.log(`[LOGIN_TRACE] User found via Vendor table: ${user.id}`);
        }
        
        // Check Agency table if not found in Vendor
        if (!user) {
          const agency = await prisma.agency.findFirst({
            where: { mobile: identifier },
            include: { user: true }
          });
          if (agency) {
            user = agency.user;
            console.log(`[LOGIN_TRACE] User found via Agency table: ${user.id}`);
          }
        }
        
        // Check Supervisor table if not found in Agency
        if (!user) {
          const supervisor = await prisma.supervisor.findFirst({
            where: { mobile: identifier },
            include: { user: true }
          });
          if (supervisor) {
            user = supervisor.user;
            console.log(`[LOGIN_TRACE] User found via Supervisor table: ${user.id}`);
          }
        }
        
        // Check Depot table for contactNumber (for DepotAdmin users)
        if (!user) {
          const depot = await prisma.depot.findFirst({
            where: { contactNumber: identifier },
            include: { 
              members: {
                where: { role: 'DepotAdmin' }
              }
            }
          });
          if (depot && depot.members.length > 0) {
            // If multiple depot admins, take the first one
            user = depot.members[0];
            console.log(`[LOGIN_TRACE] User found via Depot contactNumber: ${user.id}`);
          }
        }
      }
    }
    console.log(`[LOGIN_TRACE] User fetched: ${user ? user.id : 'null'}`);

    if (!user) {
      console.log("[LOGIN_TRACE] User not found.");
      return next(createError(401, "Invalid credentials"));
    }

    console.log("[LOGIN_TRACE] Comparing password...");
    const isPasswordValid = await bcrypt.compare(password, user.password);
    console.log(`[LOGIN_TRACE] Password valid: ${isPasswordValid}`);
    if (!isPasswordValid) {
      console.log("[LOGIN_TRACE] Invalid password.");
      return next(createError(401, "Invalid credentials"));
    }

    console.log(`[LOGIN_TRACE] Checking if user active: ${user.active}`);
    if (!user.active) {
      console.log("[LOGIN_TRACE] User inactive.");
      return next(createError(403, "Account is inactive. Please contact support."));
    }

    // Policy Acceptance Logic - Commented out as requested
    /*
    console.log("[LOGIN_TRACE] Starting policy acceptance logic...");
    let requiresPolicyAcceptance = false;
    console.log("[LOGIN_TRACE] Fetching site policy setting...");
    const sitePolicySetting = await prisma.siteSetting.findUnique({
      where: { key: POLICY_TEXT_KEY },
    });
    console.log(`[LOGIN_TRACE] Site policy setting fetched: ${sitePolicySetting ? 'found' : 'not found'}, version: ${sitePolicySetting?.version}`);
    const activePolicyVersion = sitePolicySetting?.version;

    if (user.role !== "admin") {
      console.log("[LOGIN_TRACE] User is not admin, evaluating policy acceptance.");
      if (sitePolicySetting && activePolicyVersion != null) {
        requiresPolicyAcceptance = user.policyAcceptedVersion == null || user.policyAcceptedVersion < activePolicyVersion;
        console.log(`[LOGIN_TRACE] Policy set. User accepted version: ${user.policyAcceptedVersion}, Current policy version: ${activePolicyVersion}, Requires acceptance: ${requiresPolicyAcceptance}`);
      } else {
        requiresPolicyAcceptance = user.policyAcceptedVersion == null;
        console.log(`[LOGIN_TRACE] No policy set or no version. User accepted version: ${user.policyAcceptedVersion}, Requires acceptance: ${requiresPolicyAcceptance}`);
      }
    } else {
      console.log("[LOGIN_TRACE] User is admin, skipping policy acceptance check.");
    }
    console.log("[LOGIN_TRACE] Policy acceptance logic complete.");
    */

    console.log("[LOGIN_TRACE] Updating lastLogin...");
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() },
    });
    console.log("[LOGIN_TRACE] lastLogin updated.");

    const tokenPayload = {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    };
    console.log("[LOGIN_TRACE] Base token payload created.");

    console.log("[LOGIN_TRACE] Signing JWT token...");
    const token = jwt.sign(tokenPayload, jwtConfig.secret, {
      expiresIn: jwtConfig.expiresIn,
    });
    console.log("[LOGIN_TRACE] JWT token signed.");

    const { password: _, resetToken: __, resetTokenExpires: ___, ...userWithoutSensitiveData } = user;

    console.log("[LOGIN_TRACE] Preparing to send response...");
    res.json({
      message: "Login successful",
      token,
      user: userWithoutSensitiveData,
      requiresPolicyAcceptance: false,
    });
    console.log("[LOGIN_TRACE] Response should have been sent.");
  } catch (error) {
    console.error("[LOGIN_ERROR] Error during login:", error);
    next(error);
  }
};

const forgotPassword = async (req, res, next) => {
  const schema = z.object({
    email: z
      .string()
      .email("Invalid Email format")
      .nonempty("Email is required"),
  });
  console.log("Forgot password request:", req.body);

  try {
    const validationErrors = await validateRequest(schema, req.body, res);
    const { email, resetUrl } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return setTimeout(() => {
        res.status(404).json({ errors: { message: "User not found" } });
      }, 3000);
    }

    const resetToken = uuidv4();
    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetToken,
        resetTokenExpires: new Date(Date.now() + 3600000), // Token expires in 1 hour
      },
    });
    const resetLink = `${resetUrl}/${resetToken}`; // Replace with your actual domain
    const templateData = {
      name: user.name,
      resetLink,
      appName: config.appName,
    };
    await emailService.sendEmail(
      email,
      "Password Reset Request",
      "passwordReset",
      templateData
    );

    res.json({ message: "Password reset link sent" });
  } catch (error) {
    next(error);
  }
};

const resetPassword = async (req, res, next) => {
  console.log("Reset password request:", req.body);
  const schema = z.object({
    password: z.string().min(6, "Password must be at least 6 characters long"),
  });

  try {
    // Use the reusable validation function
    const validationErrors = await validateRequest(schema, req.body, res);
    const { password } = req.body;
    const { token } = req.body;

    const user = await prisma.user.findFirst({
      where: {
        resetToken: token,
        resetTokenExpires: { gt: new Date() }, // Check if the token is not expired
      },
    });

    if (!user) {
      return res
        .status(400)
        .json({ errors: { message: "Invalid or expired token" } });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        resetToken: null, // Clear the token after use
        resetTokenExpires: null,
      },
    });
    res.json({ message: "Password reset successful" });
  } catch (error) {
    next(error);
  }
};

// Controller to get the site policy text
const getPolicyText = async (req, res, next) => {
  try {
    const policySetting = await prisma.siteSetting.findUnique({
      where: { key: POLICY_TEXT_KEY }, // Use the defined constant
    });

    if (!policySetting || typeof policySetting.value !== 'string') {
      return next(createError(404, "Policy text not found or is not in the correct format."));
    }

    res.json({ policyText: policySetting.value });
  } catch (error) {
    console.error("Error fetching policy text:", error);
    next(createError(500, "Failed to retrieve policy text."));
  }
};

const acceptPolicy = async (req, res, next) => {
  try {
    const userId = req.user.id; // Assuming isAuthenticated middleware adds user to req

    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized: User ID not found in token.' });
    }

    // Get the current policy version from SiteSetting
    const sitePolicySetting = await prisma.siteSetting.findUnique({
      where: { key: POLICY_TEXT_KEY },
    });

    if (!sitePolicySetting || sitePolicySetting.version == null) {
      // This case means policy isn't configured properly in settings, or version is missing.
      // It's an internal issue if acceptPolicy is called when no policy/version exists.
      console.error(`Attempted to accept policy, but no policy/version found in SiteSetting for key: ${POLICY_TEXT_KEY}`);
      return next(createError(500, "Could not accept policy: Policy configuration error."));
    }

    const currentPolicyVersion = sitePolicySetting.version;

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        policyAccepted: true,
        policyAcceptedAt: new Date(),
        policyAcceptedVersion: currentPolicyVersion, // Store the version of the policy they accepted
      },
      select: { // Select only the fields safe to return
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        lastLogin: true,
        policyAccepted: true,
        policyAcceptedAt: true,
        policyAcceptedVersion: true,
      },
    });

    res.status(200).json({
      message: 'Policy accepted successfully.',
      user: updatedUser,
    });
  } catch (error) {
    console.error('Error accepting policy:', error);
    next(error); // Pass to global error handler
  }
};

const changePassword = async (req, res, next) => {
  const userId = req.user?.id; // Assuming isAuthenticated middleware adds user to req

  if (!userId) {
    return next(createError(401, "Unauthorized: User not authenticated."));
  }

  const schema = z
    .object({
      currentPassword: z.string().min(1, "Current password is required."),
      newPassword: z
        .string()
        .min(6, "New password must be at least 6 characters long."),
    })
    // We don't need to check if newPassword and confirmPassword match here,
    // as the frontend dialog already does that. The backend only needs newPassword.

  try {
    // Validate request body
    const validationResult = await validateRequest(schema, req.body, res);
    if (validationResult && validationResult.errors) {
      // If validateRequest sends a response, it returns an object with errors
      // If it doesn't send a response (e.g. on success), it might return undefined or the data
      // This check ensures we don't proceed if validation failed and response was sent.
      return; 
    }
    
    const { currentPassword, newPassword } = req.body;

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      // This case should ideally not happen if user is authenticated
      return next(createError(404, "User not found."));
    }

    const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isPasswordValid) {
      return next(createError(400, "Incorrect current password."));
    }

    const hashedNewPassword = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedNewPassword },
    });

    res.status(200).json({ message: "Password changed successfully." });

  } catch (error) {
    console.error("Error changing password:", error);
    // Pass to global error handler, which might send a 500 error
    // Or, if it's a validation error from http-errors, it will use that status
    next(error); 
  }
};

module.exports = {
  register,
  login,
  forgotPassword,
  resetPassword,
    getPolicyText,
  acceptPolicy,
  changePassword,
};
