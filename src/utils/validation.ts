/**
 * Salesforce ID Validation Utilities
 *
 * Provides validation functions for Salesforce Lead IDs to prevent SOQL injection attacks.
 * Salesforce Lead IDs can be either 15 or 18 characters, starting with "00Q" for Leads
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

  // Salesforce Lead IDs: 15 or 18 characters starting with "00Q"
  // 15-char format: 00Q followed by 12 alphanumeric characters
  // 18-char format: 00Q followed by 15 alphanumeric characters (case-sensitive extension)
  const salesforceLeadPattern15 = /^00Q[a-zA-Z0-9]{12}$/;
  const salesforceLeadPattern18 = /^00Q[a-zA-Z0-9]{15}$/;

  return salesforceLeadPattern15.test(id) || salesforceLeadPattern18.test(id);
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
