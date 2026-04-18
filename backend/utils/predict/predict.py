import sys
import json
import os
from ultralytics import YOLO

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.environ.get("YOLO_MODEL_PATH") or os.path.join(BASE_DIR, "best.pt")
model = YOLO(MODEL_PATH)

def predict_image(image_path):
    if not os.path.exists(image_path):
        return {"status": "error", "message": "File not found"}

    results = model.predict(source=image_path, conf=0.5, verbose=False)

    labels_with_positions = []
    for result in results:
        for box in result.boxes:
            x_center = int((box.xywh[:, 0]).item())
            label = result.names[int(box.cls[0].item())]
            labels_with_positions.append((x_center, label))

    sorted_labels = sorted(labels_with_positions, key=lambda x: x[0])
    sorted_label_names = [label for _, label in sorted_labels]
    concatenated_labels = ''.join(sorted_label_names)
    numeric_label = int(concatenated_labels) if concatenated_labels.isdigit() else None

    return {
        "status": "success",
        "detections": {
            "sorted_labels": sorted_label_names,
            "concatenated_labels": concatenated_labels,
            "numeric_value": numeric_label
        }
    }

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"status": "error", "message": "No image path provided"}))
        sys.exit(1)

    image_path = sys.argv[1]
    result = predict_image(image_path)
    print(json.dumps(result))
