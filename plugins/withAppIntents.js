/**
 * Expo config plugin that adds App Intent Swift files to the main app target.
 *
 * App Intents MUST live in the main app binary — iOS's metadata extractor
 * (`appintentsmetadataprocessor`) only scans the main target, not linked
 * frameworks like Expo modules. This plugin:
 *  1. Copies StartPracticeIntent.swift and AppShortcuts.swift into ios/{ProjectName}/
 *  2. Adds them to the Xcode project's main target build phase
 *  3. Links the AppIntents framework
 */
const { withDangerousMod, withXcodeProject } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const INTENT_FILES = ['StartPracticeIntent.swift', 'AppShortcuts.swift'];
const SOURCE_DIR = 'modules/expo-app-intents/intent-sources';

module.exports = function withAppIntents(config) {
  // Step 1: Copy Swift intent files into the generated iOS project
  config = withDangerousMod(config, [
    'ios',
    async (config) => {
      const { projectRoot, projectName } = config.modRequest;
      const destDir = path.join(projectRoot, 'ios', projectName);
      const srcDir = path.join(projectRoot, SOURCE_DIR);

      for (const file of INTENT_FILES) {
        const src = path.join(srcDir, file);
        const dst = path.join(destDir, file);
        if (!fs.existsSync(src)) {
          console.warn(`[withAppIntents] Source file not found: ${src}`);
          continue;
        }
        fs.copyFileSync(src, dst);
        console.log(`[withAppIntents] Copied ${file} to ios/${projectName}/`);
      }

      return config;
    },
  ]);

  // Step 2: Add files to Xcode project main target + link AppIntents framework
  config = withXcodeProject(config, (config) => {
    const project = config.modResults;
    const { projectName } = config.modRequest;
    const target = project.getFirstTarget();

    // Find the app source group (named after the project, e.g. "LingoLock")
    const groups = project.hash.project.objects.PBXGroup;
    let appGroupKey = null;
    for (const [key, val] of Object.entries(groups)) {
      if (typeof val === 'object' && val.name === projectName) {
        appGroupKey = key;
        break;
      }
    }

    for (const file of INTENT_FILES) {
      const filePath = `${projectName}/${file}`;
      if (!project.hasFile(filePath)) {
        project.addSourceFile(filePath, { target: target.uuid }, appGroupKey);
        console.log(`[withAppIntents] Added ${file} to Xcode main target`);
      }
    }

    // Link AppIntents.framework (system framework, iOS 16+)
    project.addFramework('AppIntents.framework', { weak: false });
    console.log('[withAppIntents] Linked AppIntents.framework');

    return config;
  });

  return config;
};
