module.exports = {
  //only superadmin section
  //members
  "users.read": ["super_admin"],
  "users.write": ["super_admin"],
  "users.delete": ["super_admin"],
  "users.export": ["super_admin"],
  "members.export": ["super_admin", "admin", "member", "member"],
  "transactions.export": ["super_admin", "admin", "member", "member"],
 
  //packages
  "packages.read": ["super_admin"],
  "packages.write": ["super_admin"],
  "packages.delete": ["super_admin"],
  "subscriptions.write": ["super_admin"],
  //zones
  "zones.read": ["super_admin", "admin"],
  "zones.write": ["super_admin"],
  "zones.delete": ["super_admin"],
  //trainings
  "trainings.read": ["super_admin", "admin"],
  "trainings.write": ["super_admin", "admin"],
  "trainings.update": ["super_admin", "admin"],
  "trainings.delete": ["super_admin"],
  //categories
  "categories.read": ["super_admin", "admin"],
  "categories.write": ["super_admin", "admin"],
  "categories.update": ["super_admin", "admin"],
  "categories.delete": ["super_admin"],
  //messages
  "messages.read": ["super_admin", "admin", "member", "member"],
  "messages.write": ["super_admin", "admin", "member", "member"],
  "messages.update": ["super_admin", "admin", "member", "member"],
  "messages.delete": ["super_admin", "admin", "member", "member"],
  // requirements
  "requirements.read": ["super_admin", "admin", "member", "member"],
  "requirements.write": ["super_admin", "admin", "member", "member"],
  "requirements.delete": ["super_admin", "admin", "member", "member"],
  // one-to-ones
  "onetoones.read": ["super_admin", "admin", "member", "member"],
  "onetoones.write": ["super_admin", "admin", "member", "member"],
  "onetoones.delete": ["super_admin", "admin", "member", "member"],
 
   
 
 
  //roles
  "roles.read": ["super_admin"],

  "USERS_LIST_ALL": ["ADMIN"],

  // Admin specific permissions
  // "ADMIN_USERS_LIST": ["ADMIN"],

  // Vendor CRUD permissions
  "VENDORS_CREATE": ["ADMIN"],
  "VENDORS_LIST":   ["ADMIN"],
  "VENDORS_READ":   ["ADMIN", "VENDOR"],
  "VENDORS_UPDATE": ["ADMIN", "VENDOR"],
  "VENDORS_DELETE": ["ADMIN"],

  // Agency CRUD permissions
  "AGENCIES_CREATE": ["ADMIN"],
  "AGENCIES_LIST":   ["ADMIN"],
  "AGENCIES_READ":   ["ADMIN", "AGENCY"],
  "AGENCIES_UPDATE": ["ADMIN", "AGENCY"],
  "AGENCIES_DELETE": ["ADMIN"]
};
