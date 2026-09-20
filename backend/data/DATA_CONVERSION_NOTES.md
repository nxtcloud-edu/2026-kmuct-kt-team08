# 잠실역 3km 데이터 변환 결과

## 생성 파일
- streetlights.csv: 2,355행
- shade.csv: 18,899행
- noise.csv: 7,761행
- lighting.csv: 6,917행
- crowd_grid.csv: 9,739행
- store_zones.csv: 70행
- streetlight_segments.csv: 헤더만 생성
- events.csv: 헤더만 생성
- raw_models.py: 현재 데이터에 맞춘 수정본

## 변환 규칙

### shade.csv
원본 가로수 데이터에는 실제 그늘 면적/세기 측정값이 없습니다.
`shade_score=100`은 실측 그늘 점수가 아니라 "나무가 존재함"을 나타내는 presence proxy입니다.
최종 경로 `shadeScore`는 경로 주변 가로수 개수/밀도로 집계하는 방식을 권장합니다.

### noise.csv
S-DoT 평균 소음을 그대로 dB로 사용했습니다.
`noise_type=environment`를 사용하므로 수정된 raw_models.py의 NoiseType.ENVIRONMENT가 필요합니다.
시간은 KST 기준 ISO 8601(+09:00)로 변환했습니다.

### lighting.csv
S-DoT 평균 조도를 `illuminance_lux`로 변환했습니다.
기존 모델에 없던 LightingRow가 수정된 raw_models.py에 추가되어 있습니다.

### crowd_grid.csv
생활인구는 소수값이므로 `population: float`로 변경했습니다.
현재 원본은 2026-09-15 하루의 시간대별 데이터입니다.

### store_zones.csv
상권별 전체 업종 집계이므로 `zone_type=mixed`로 변환했습니다.

### streetlight_segments.csv
보행 도로 네트워크가 아직 없어 생성할 수 없습니다.
계약 유지용으로 헤더만 생성했습니다.
보행 네트워크 확보 후 segment별 가로등 개수를 계산해야 합니다.

### events.csv
행사는 서울 문화행사 API에서 현재 시각 기준으로 동적으로 불러오기로 했으므로
정적 데이터 대신 헤더만 생성했습니다.
