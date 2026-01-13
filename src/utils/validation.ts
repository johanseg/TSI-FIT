/**
 * Salesforce ID Validation Utilities
 *
 * Provides validation functions for Salesforce Lead IDs to prevent SOQL injection attacks.
 * Salesforce Lead IDs can be either 15 or 18 characters, starting with "00Q" for Leads.
 */

// Salesforce Lead ID pattern: 00Q followed by 12 or 15 alphanumeric characters
const SALESFORCE_LEAD_ID_PATTERN = /^00Q[a-zA-Z0-9]{12}$|^00Q[a-zA-Z0-9]{15}$/;

/**
 * Validates a single Salesforce Lead ID format
 */
export function validateSalesforceId(id: string): boolean {
  return typeof id === 'string' && SALESFORCE_LEAD_ID_PATTERN.test(id);
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
