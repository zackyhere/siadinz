const separator = "\u0000";
const replacementCharacter = "\uFFFD";

function part(value) {
  return String(value ?? "").trim();
}

export function legacyCourseKey(courseCode, classGroup) {
  return `${part(courseCode)}${separator}${part(classGroup)}`;
}

export function dailySkipKey(courseCode, classGroup) {
  return `v1:${encodeURIComponent(JSON.stringify([part(courseCode), part(classGroup)]))}`;
}

export function isSkippedCourse(key, courseCode, classGroup) {
  const storedKey = String(key);
  const legacyKey = legacyCourseKey(courseCode, classGroup);
  const malformedLegacyKey = legacyKey.replace(separator, replacementCharacter);
  return storedKey === dailySkipKey(courseCode, classGroup)
    || storedKey === legacyKey
    || storedKey === malformedLegacyKey
    || storedKey.startsWith(`${legacyKey}${separator}`)
    || storedKey.startsWith(`${malformedLegacyKey}${replacementCharacter}`);
}

export function dailySkipKeyVariants(key) {
  const storedKey = String(key);
  if (!storedKey.startsWith("v1:")) return { exact: [storedKey], legacyPrefixes: storedKey.includes(separator) ? [`${storedKey}${separator}*`, `${storedKey.replace(separator, replacementCharacter)}${replacementCharacter}*`] : [] };
  try {
    const [courseCode, classGroup] = JSON.parse(decodeURIComponent(storedKey.slice(3)));
    const legacyKey = legacyCourseKey(courseCode, classGroup);
    return {
      exact: [storedKey, legacyKey, legacyKey.replace(separator, replacementCharacter)],
      legacyPrefixes: [`${legacyKey}${separator}*`, `${legacyKey.replace(separator, replacementCharacter)}${replacementCharacter}*`],
    };
  } catch {
    return { exact: [storedKey], legacyPrefixes: [] };
  }
}
