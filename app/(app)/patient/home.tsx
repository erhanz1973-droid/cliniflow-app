
import React from "react";
import { View, Button, StyleSheet } from "react-native";
import { useRouter } from "expo-router";

export default function PatientHome() {
	const router = useRouter();

	return (
		<View style={styles.container}>
			<Button
				title="AI Guided Dental Photos"
				onPress={() => router.push("/patient/AIGuidedPhotoCapture")}
				color="#2563eb"
			/>
			<Button
				title="Select photo manually"
				onPress={() => router.push("/patient/OldPhotoPicker")}
				color="#9ca3af"
			/>
		</View>
	);
}

const styles = StyleSheet.create({
	container: { flex: 1, justifyContent: "center", alignItems: "center", gap: 16 }
});
