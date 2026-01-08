/**
 * Salesforce ID Validation Utilities
 *
 * Provides validation functions for Salesforce Lead IDs to prevent SOQL injection attacks.
 * Salesforce Lead IDs follow a specific format: 15 characters starting with "00"
 */

/**
 * Validates a single Salesforce Lead ID format
 * @param id - The Salesforce Lead ID to validate
 * @returns true if the ID matches the valid Salesforce Lead ID format, false otherwise
 */
export function validateSalesforceId(id: string): boolean {
  if (!id || typeof id !== 'string') {
    return false;
  }

  // Salesforce Lead IDs: 15 characters starting with "00"
  const salesforceIdPattern = /^00[a-zA-Z0-9]{13}$/;
  return salesforceIdPattern.test(id);
}

/**
 * Validates an array of Salesforce Lead IDs
 * @param ids - Array of Salesforce Lead IDs to validate
 * @returns Object containing validation result and list of invalid IDs if any
 */
export function validateSalesforceIds(ids: string[]): { valid: boolean; invalidIds: string[] } {
  if (!Array.isArray(ids)) {
    return { valid: false, invalidIds: [] };
  }

  const invalidIds = ids.filter(id => !validateSalesforceId(id));

  return {
    valid: invalidIds.length === 0,
    invalidIds
  };
}
