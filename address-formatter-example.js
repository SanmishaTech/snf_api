// Address Formatter Utility for Frontend
// This can be used in your React component to properly format delivery addresses

const formatDeliveryAddress = (deliveryAddress) => {
  if (!deliveryAddress) return '';
  
  const addressParts = [];
  
  // Add recipient name if available
  if (deliveryAddress.recipientName?.trim()) {
    addressParts.push(deliveryAddress.recipientName.trim());
  }
  
  // Add plot/building if available
  if (deliveryAddress.plotBuilding?.trim()) {
    addressParts.push(deliveryAddress.plotBuilding.trim());
  }
  
  // Add street/area if available
  if (deliveryAddress.streetArea?.trim()) {
    addressParts.push(deliveryAddress.streetArea.trim());
  }
  
  // Add landmark if available
  if (deliveryAddress.landmark?.trim()) {
    addressParts.push(deliveryAddress.landmark.trim());
  }
  
  // Add city if available
  if (deliveryAddress.city?.trim()) {
    addressParts.push(deliveryAddress.city.trim());
  }
  
  // Add state if available
  if (deliveryAddress.state?.trim()) {
    addressParts.push(deliveryAddress.state.trim());
  }
  
  // Add pincode if available
  if (deliveryAddress.pincode?.trim()) {
    addressParts.push(deliveryAddress.pincode.trim());
  }
  
  return addressParts.join(', ');
};

// Alternative version with more control over formatting
const formatDeliveryAddressDetailed = (deliveryAddress) => {
  if (!deliveryAddress) return '';
  
  const parts = [];
  
  // Recipient name (if present)
  if (deliveryAddress.recipientName?.trim()) {
    parts.push(deliveryAddress.recipientName.trim());
  }
  
  // Address line 1: Plot/Building, Street/Area
  const addressLine1 = [];
  if (deliveryAddress.plotBuilding?.trim()) {
    addressLine1.push(deliveryAddress.plotBuilding.trim());
  }
  if (deliveryAddress.streetArea?.trim()) {
    addressLine1.push(deliveryAddress.streetArea.trim());
  }
  if (addressLine1.length > 0) {
    parts.push(addressLine1.join(', '));
  }
  
  // Landmark (if present)
  if (deliveryAddress.landmark?.trim()) {
    parts.push(`Near ${deliveryAddress.landmark.trim()}`);
  }
  
  // City, State Pincode
  const locationParts = [];
  if (deliveryAddress.city?.trim()) {
    locationParts.push(deliveryAddress.city.trim());
  }
  if (deliveryAddress.state?.trim()) {
    locationParts.push(deliveryAddress.state.trim());
  }
  if (deliveryAddress.pincode?.trim()) {
    locationParts.push(deliveryAddress.pincode.trim());
  }
  if (locationParts.length > 0) {
    parts.push(locationParts.join(' '));
  }
  
  return parts.join(', ');
};

// Usage in your React component:
/*
{sub.deliveryAddress && (
  <p>
    <strong>Delivering to:</strong> {formatDeliveryAddress(sub.deliveryAddress)}
  </p>
)}

// Or with the detailed version:
{sub.deliveryAddress && (
  <p>
    <strong>Delivering to:</strong> {formatDeliveryAddressDetailed(sub.deliveryAddress)}
  </p>
)}
*/

module.exports = {
  formatDeliveryAddress,
  formatDeliveryAddressDetailed
};
