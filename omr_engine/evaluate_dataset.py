import argparse
import csv
import json
import os
from typing import Dict, List

import scanner


def load_keys(path: str) -> Dict[str, Dict[str, str]]:
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data


def evaluate_row(pred: Dict[str, str], truth: Dict[str, str]):
    qs = sorted(truth.keys(), key=lambda x: int(x))
    correct = 0
    full_ok = True
    for q in qs:
        if pred.get(q, "") == truth.get(q, ""):
            correct += 1
        else:
            full_ok = False
    return correct, len(qs), full_ok


def main():
    parser = argparse.ArgumentParser(description="Evaluate OMR dataset quality metrics.")
    parser.add_argument("--images-dir", required=True, help="Directory containing scanned sheet images.")
    parser.add_argument("--truth-json", required=True, help="JSON map: {image_name: {q:answer}}")
    parser.add_argument("--style", default="default", help="Template style: default|elite|nafs")
    parser.add_argument("--num-questions", type=int, default=20)
    parser.add_argument("--out-csv", default="dataset_eval.csv")
    args = parser.parse_args()

    truth = load_keys(args.truth_json)
    image_names = sorted(truth.keys())
    if not image_names:
        raise SystemExit("No entries in truth JSON.")

    rows: List[Dict[str, object]] = []
    total_correct = 0
    total_questions = 0
    full_sheet_ok = 0
    total_review_qs = 0
    high_conf_wrong = 0

    for name in image_names:
        img_path = os.path.join(args.images_dir, name)
        if not os.path.exists(img_path):
            rows.append({"image": name, "error": "missing file"})
            continue

        result = scanner.scan_omr(
            img_path,
            is_bytes=False,
            style=args.style,
            from_scanner=True,
            num_questions=args.num_questions,
        )
        pred = result.get("answers", {})
        gt = truth[name]
        c, t, full_ok = evaluate_row(pred, gt)
        total_correct += c
        total_questions += t
        if full_ok:
            full_sheet_ok += 1
        total_review_qs += len(result.get("needs_review_questions", []))

        conf = result.get("confidence", {})
        for q, gt_ans in gt.items():
            p = pred.get(q, "")
            if p != gt_ans and float(conf.get(q, 0.0)) >= 0.90:
                high_conf_wrong += 1

        rows.append({
            "image": name,
            "student_id": result.get("student_id", ""),
            "decision_status": result.get("decision_status", ""),
            "score_correct": c,
            "score_total": t,
            "sheet_perfect": full_ok,
            "review_questions": len(result.get("needs_review_questions", [])),
            "avg_confidence": result.get("average_confidence", 0),
        })

    accuracy = (total_correct / total_questions * 100.0) if total_questions else 0.0
    sheet_perfect_pct = (full_sheet_ok / len(image_names) * 100.0) if image_names else 0.0
    review_rate = (total_review_qs / total_questions * 100.0) if total_questions else 0.0

    with open(args.out_csv, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=[
                "image", "student_id", "decision_status", "score_correct",
                "score_total", "sheet_perfect", "review_questions", "avg_confidence",
            ],
        )
        writer.writeheader()
        writer.writerows(rows)

    summary = {
        "question_level_accuracy_pct": round(accuracy, 4),
        "sheet_level_perfect_pct": round(sheet_perfect_pct, 4),
        "needs_review_rate_pct": round(review_rate, 4),
        "high_confidence_critical_errors": int(high_conf_wrong),
        "sheets_count": len(image_names),
        "total_questions": total_questions,
        "csv_path": args.out_csv,
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
