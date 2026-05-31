#!/usr/bin/env python3

import unittest
import sys
import os
from unittest.mock import patch, MagicMock
from datetime import datetime, timedelta

# 현재 디렉토리에서 모듈 임포트
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from startup_support import search_startup_support, get_startup_program_detail, StartupSupportAPI

class TestStartupSupport(unittest.TestCase):
    """스타트업 지원사업 API 테스트"""

    def setUp(self):
        """테스트 초기화"""
        soon_deadline = (datetime.now() + timedelta(days=5)).strftime('%Y-%m-%d')
        later_deadline = (datetime.now() + timedelta(days=10)).strftime('%Y-%m-%d')
        self.test_programs = [
            {
                'id': 'test_001',
                'title': '서울시 청년 스타트업 창업 지원금',
                'organization': '서울시',
                'region': '서울특별시',
                'support_type': '보조금',
                'amount': '최대 5천만원',
                'deadline': later_deadline,
                'target': '만 19~34세 청년 창업가',
                'contact': '02-1234-5678',
                'url': 'https://seoulstartup.go.kr/program/001',
                'source': '서울시 창업플러스',
                'last_updated': '2024-05-20'
            },
            {
                'id': 'test_002',
                'title': '경기도 MVP 지원사업',
                'organization': '경기도',
                'region': '경기도',
                'support_type': '보조금',
                'amount': '최대 3천만원',
                'deadline': soon_deadline,
                'target': 'MVP 개발 스타트업',
                'contact': '031-1234-5678',
                'url': 'https://g-startup.kr/program/002',
                'source': '경기도 창업진흥원',
                'last_updated': '2024-05-20'
            }
        ]

    @patch('startup_support.StartupSupportAPI._search_data_go_kr')
    @patch('startup_support.StartupSupportAPI._search_by_region')
    def test_search_programs_basic(self, mock_region_search, mock_data_go_kr_search):
        """기본 검색 테스트"""
        # 모킹 설정
        mock_data_go_kr_search.return_value = []
        mock_region_search.return_value = self.test_programs

        # 검색 실행
        result = search_startup_support()

        # 결과 확인
        self.assertEqual(len(result), 2)
        self.assertEqual(result[0]['title'], '경기도 MVP 지원사업')
        self.assertEqual(result[1]['title'], '서울시 청년 스타트업 창업 지원금')

    @patch('startup_support.requests.get')
    def test_nationwide_search_aggregates_configured_regions_without_api_key(self, mock_get):
        payloads = {
            'https://seoulstartup.go.kr/api/program/list': {
                'programs': [{
                    'id': 'seoul_1',
                    'title': '서울 창업 지원',
                    'deadline': '2026-06-03',
                }]
            },
            'https://g-startup.kr/api/support/list': {
                'programs': [{
                    'id': 'gyeonggi_1',
                    'title': '경기 창업 지원',
                    'deadline': '2026-06-04',
                }]
            },
        }

        def fake_get(url, **_):
            response = MagicMock()
            response.status_code = 200
            response.json.return_value = payloads.get(url, {'programs': []})
            return response

        mock_get.side_effect = fake_get

        with patch.dict(os.environ, {}, clear=True):
            result = search_startup_support(region='전국')

        titles = {program['title'] for program in result}
        self.assertIn('서울 창업 지원', titles)
        self.assertIn('경기 창업 지원', titles)

    def test_builtin_detail_lookup_does_not_return_fabricated_sample_data(self):
        self.assertIsNone(get_startup_program_detail('data_gov_missing'))
        self.assertIsNone(get_startup_program_detail('서울_missing'))

    @patch('startup_support.StartupSupportAPI._search_data_go_kr')
    @patch('startup_support.StartupSupportAPI._search_by_region')
    def test_search_programs_seoul_only(self, mock_region_search, mock_data_go_kr_search):
        """서울 지역 검색 테스트"""
        # 모킹 설정
        mock_data_go_kr_search.return_value = []
        mock_region_search.return_value = [self.test_programs[0]]  # 서울 프로그램만

        # 검색 실행
        result = search_startup_support(region='서울특별시')

        # 결과 확인
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]['region'], '서울특별시')

    @patch('startup_support.StartupSupportAPI._search_data_go_kr')
    @patch('startup_support.StartupSupportAPI._search_by_region')
    def test_search_programs_keyword_search(self, mock_region_search, mock_data_go_kr_search):
        """키워드 검색 테스트"""
        # 모킹 설정
        mock_data_go_kr_search.return_value = []
        mock_region_search.return_value = [self.test_programs[1]]  # MVP 프로그램만

        # 검색 실행
        result = search_startup_support(keyword='MVP')

        # 결과 확인
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]['title'], '경기도 MVP 지원사업')

    @patch('startup_support.StartupSupportAPI._search_data_go_kr')
    @patch('startup_support.StartupSupportAPI._search_by_region')
    def test_search_programs_deadline_only(self, mock_region_search, mock_data_go_kr_search):
        """마감 임박 검색 테스트"""
        # 모킹 설정
        mock_data_go_kr_search.return_value = []
        mock_region_search.return_value = self.test_programs

        # 검색 실행
        result = search_startup_support(deadline_only=True)

        # 결과 확인 (7일 이내 마감만)
        self.assertEqual(len(result), 1)
        for program in result:
            deadline = datetime.strptime(program['deadline'], '%Y-%m-%d')
            self.assertTrue(datetime.now() <= deadline <= datetime.now() + timedelta(days=7))

    @patch('startup_support.StartupSupportAPI._get_data_go_kr_detail')
    def test_get_program_detail_data_gov(self, mock_get_detail):
        """공공데이터포털 상세 정보 조회 테스트"""
        # 모킹 설정
        mock_get_detail.return_value = self.test_programs[0]

        # 상세 정보 조회
        result = get_startup_program_detail('data_gov_test_001')

        # 결과 확인
        self.assertIsNotNone(result)
        self.assertEqual(result['title'], '서울시 청년 스타트업 창업 지원금')

    @patch('startup_support.StartupSupportAPI._get_region_detail')
    def test_get_program_detail_region(self, mock_get_detail):
        """지자체 상세 정보 조회 테스트"""
        # 모킹 설정
        mock_get_detail.return_value = self.test_programs[1]

        # 상세 정보 조회
        result = get_startup_program_detail('서울_test_001')

        # 결과 확인
        self.assertIsNotNone(result)
        self.assertEqual(result['title'], '경기도 MVP 지원사업')

    def test_parse_program_from_data_go_kr(self):
        """공공데이터포털 데이터 파싱 테스트"""
        api = StartupSupportAPI()

        # 테스트 데이터
        item = {
            'pan_id': 'test_001',
            'pan_nm': '테스트 지원사업',
            'cnp_cd_nm': '서울특별시',
            'support_type': '보조금',
            'amount': '최대 5천만원',
            'clsg_dt': '2024-12-31',
            'target': '청년 창업가',
            'contact': '02-1234-5678',
            'detail_url': 'https://test.com',
            'last_updated': '2024-05-20'
        }

        # 파싱 실행
        result = api._parse_program_from_data_go_kr(item)

        # 결과 확인
        self.assertIsNotNone(result)
        self.assertEqual(result['title'], '테스트 지원사업')
        self.assertEqual(result['region'], '서울특별시')
        self.assertEqual(result['support_type'], '보조금')

    def test_parse_program_from_region_api(self):
        """지자체 API 데이터 파싱 테스트"""
        from startup_support import StartupSupportAPI

        api = StartupSupportAPI()

        # 테스트 데이터
        item = {
            'id': 'test_001',
            'title': '테스트 지원사업',
            'type': '융자',
            'amount': '최대 1억원',
            'deadline': '2024-12-31',
            'target': '중소기업',
            'contact': '02-1234-5678',
            'url': 'https://test.com',
            'last_updated': '2024-05-20'
        }

        # 파싱 실행
        result = api._parse_program_from_region_api(item, '경기도')

        # 결과 확인
        self.assertIsNotNone(result)
        self.assertEqual(result['title'], '테스트 지원사업')
        self.assertEqual(result['organization'], '경기도 창업진흥원')
        self.assertEqual(result['support_type'], '융자')

    def test_filter_upcoming_deadline(self):
        """마감 임박 필터링 테스트"""
        from startup_support import StartupSupportAPI
        from datetime import datetime, timedelta

        api = StartupSupportAPI()

        # 테스트 데이터 (다양한 마감일)
        programs = [
            {'deadline': (datetime.now() + timedelta(days=3)).strftime('%Y-%m-%d')},  # 3일 후
            {'deadline': (datetime.now() + timedelta(days=10)).strftime('%Y-%m-%d')},  # 10일 후
            {'deadline': (datetime.now() - timedelta(days=5)).strftime('%Y-%m-%d')},   # 5일 전
            {'deadline': '2024-12-31'},  # 먼 미래
            {'deadline': ''}  # 마감일 없음
        ]

        # 필터링 실행
        result = api._filter_upcoming_deadline(programs)

        # 결과 확인 (7일 이내이면서 이미 지난 날짜 제외)
        self.assertEqual(len(result), 1)

    def test_remove_duplicates(self):
        """중복 제거 테스트"""
        from startup_support import StartupSupportAPI

        api = StartupSupportAPI()

        # 테스트 데이터 (중복 포함)
        programs = [
            {'id': 'test_001', 'title': '프로그램 A'},
            {'id': 'test_002', 'title': '프로그램 B'},
            {'id': 'test_001', 'title': '프로그램 A (중복)'},
            {'id': 'test_003', 'title': '프로그램 C'}
        ]

        # 중복 제거 실행
        result = api._remove_duplicates(programs)

        # 결과 확인 (중복 제외)
        self.assertEqual(len(result), 3)
        self.assertEqual(result[0]['id'], 'test_001')
        self.assertEqual(result[1]['id'], 'test_002')
        self.assertEqual(result[2]['id'], 'test_003')

def run_tests():
    """테스트 실행"""
    # 테스트 스위트 생성
    suite = unittest.TestLoader().loadTestsFromTestCase(TestStartupSupport)

    # 테스트 실행기 생성
    runner = unittest.TextTestRunner(verbosity=2)

    # 테스트 실행
    result = runner.run(suite)

    return result.wasSuccessful()

if __name__ == '__main__':
    print("스타트업 지원사업 API 테스트 시작")

    # 테스트 실행
    success = run_tests()

    if success:
        print("✅ 모든 테스트 통과!")
    else:
        print("❌ 일부 테스트 실패")
        sys.exit(1)
