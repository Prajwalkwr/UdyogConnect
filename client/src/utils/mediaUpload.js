export function buildMultipartFormData(fields = {}) {
  const formData = new FormData();
  Object.entries(fields).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      formData.append(key, value);
    }
  });
  return formData;
}

export function appendOptionalFile(formData, fieldName, file) {
  if (file) {
    formData.append(fieldName, file);
  }
}
