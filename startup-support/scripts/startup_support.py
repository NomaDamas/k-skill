#!/usr/bin/env python3

import json
import requests
import time
from datetime import datetime, timedelta
from typing import Dict, List, Optional
import os

class StartupSupportAPI:
    """스타트업 지원사업 API 클라이언트"""

    def __init__(self):
        self.base_urls = {
            'seoul': 'https://seoulstartup.go.kr',
            'gyeonggi': 'https://g-startup.kr',
            'busan': 'https://busanstartup.kr',
            'gwangju': 'https://startup.gwangju.kr',
            'daegu': 'https://daegu-startup.kr',
            'nationwide': 'https://www.data.go.kr'
        }

        # 공공데이터포털 API 키 (환경 변수에서 가져오기)
        self.data_go_kr_api_key = os.getenv('DATA_GO_KR_API_KEY')

        # 헤더 설정
        self.headers = {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        }

    def search_programs(self, region: str = '전국', keyword: Optional[str] = None,
                       support_type: Optional[str] = None, deadline_only: bool = False) -> List[Dict]:
        """
        지원사업 검색

        Args:
            region: 지역 (서울특별시, 경기도, 부산광역시 등)
            keyword: 검색 키워드
            support_type: 지원 유형 (보조금, 융자, 멘토링 등)
            deadline_only: 마감 임박 사업만 검색

        Returns:
            지원사업 목록
        """
        programs = []

        # 1. 공공데이터포털 API 호출
        if self.data_go_kr_api_key:
            data_go_kr_programs = self._search_data_go_kr(region, keyword, support_type)
            programs.extend(data_go_kr_programs)

        # 2. 지자체별 API 호출
        region_programs = self._search_by_region(region, keyword, support_type)
        programs.extend(region_programs)

        # 3. 마감 임박 필터링
        if deadline_only:
            programs = self._filter_upcoming_deadline(programs)

        # 중복 제거
        programs = self._remove_duplicates(programs)

        # 정렬
        programs = self._sort_programs(programs)

        return programs

    def _search_data_go_kr(self, region: str, keyword: Optional[str], support_type: Optional[str]) -> List[Dict]:
        """공공데이터포털 API로 검색"""
        programs = []

        try:
            # 중소벤처기업부 스타트업 지원사업 API
            url = "https://www.data.go.kr/api/15058530/openapi"

            params = {
                'serviceKey': self.data_go_kr_api_key,
                'pageNo': '1',
                'numOfRows': '100',
                '_type': 'json'
            }

            if region and region != '전국':
                params['cnpCdNm'] = region

            if keyword:
                params['panNm'] = keyword

            response = requests.get(url, params=params, headers=self.headers, timeout=10)

            if response.status_code == 200:
                data = response.json()

                # 실제 API 응답 구조에 따라 데이터 추출
                if 'items' in data:
                    for item in data['items']:
                        program = self._parse_program_from_data_go_kr(item)
                        if program:
                            programs.append(program)

        except Exception as e:
            print(f"공공데이터포털 API 오류: {e}")

        return programs

    def _search_by_region(self, region: str, keyword: Optional[str], support_type: Optional[str]) -> List[Dict]:
        """지자체별 API로 검색"""
        programs = []

        # 지자체별 API 엔드포인트
        region_apis = {
            '서울특별시': {
                'url': 'https://seoulstartup.go.kr/api/program/list',
                'method': 'GET'
            },
            '경기도': {
                'url': 'https://g-startup.kr/api/support/list',
                'method': 'GET'
            },
            '부산광역시': {
                'url': 'https://busanstartup.kr/api/program/list',
                'method': 'GET'
            },
            '광주광역시': {
                'url': 'https://startup.gwangju.kr/api/support/list',
                'method': 'GET'
            },
            '대구광역시': {
                'url': 'https://daegu-startup.kr/api/program/list',
                'method': 'GET'
            }
        }

        target_regions = list(region_apis) if region == '전국' else [region]
        for target_region in target_regions:
            if target_region not in region_apis:
                continue
            api_info = region_apis[target_region]

            try:
                params = {}
                if keyword:
                    params['keyword'] = keyword
                if support_type:
                    params['type'] = support_type

                response = requests.get(api_info['url'], params=params,
                                     headers=self.headers, timeout=10)

                if response.status_code == 200:
                    data = response.json()

                    # 실제 API 응답 구조에 따라 데이터 추출
                    if 'programs' in data:
                        for item in data['programs']:
                            program = self._parse_program_from_region_api(item, target_region)
                            if program:
                                programs.append(program)

            except Exception as e:
                print(f"{target_region} API 오류: {e}")

        return programs

    def _parse_program_from_data_go_kr(self, item: Dict) -> Optional[Dict]:
        """공공데이터포털 응답 파싱"""
        try:
            program = {
                'id': f"data_gov_{item.get('pan_id', '')}",
                'title': item.get('pan_nm', ''),
                'organization': '중소벤처기업부',
                'region': item.get('cnp_cd_nm', '전국'),
                'support_type': item.get('support_type', '기타'),
                'amount': item.get('amount', '정보 없음'),
                'deadline': item.get('clsg_dt', ''),
                'target': item.get('target', '전체 대상'),
                'contact': item.get('contact', '02-1234-5678'),
                'url': item.get('detail_url', ''),
                'source': '공공데이터포털',
                'last_updated': item.get('last_updated', datetime.now().strftime('%Y-%m-%d'))
            }

            # 필수 필드 검증
            if not program['title']:
                return None

            return program

        except Exception as e:
            print(f"공공데이터포털 데이터 파싱 오류: {e}")
            return None

    def _parse_program_from_region_api(self, item: Dict, region: str) -> Optional[Dict]:
        """지자체 API 응답 파싱"""
        try:
            program = {
                'id': f"{region}_{item.get('id', '')}",
                'title': item.get('title', ''),
                'organization': region + ' 창업진흥원',
                'region': region,
                'support_type': item.get('type', '기타'),
                'amount': item.get('amount', '정보 없음'),
                'deadline': item.get('deadline', ''),
                'target': item.get('target', '전체 대상'),
                'contact': item.get('contact', '02-1234-5678'),
                'url': item.get('url', ''),
                'source': region + ' 창업진흥원',
                'last_updated': item.get('last_updated', datetime.now().strftime('%Y-%m-%d'))
            }

            # 필수 필드 검증
            if not program['title']:
                return None

            return program

        except Exception as e:
            print(f"지자체 API 데이터 파싱 오류: {e}")
            return None

    def _filter_upcoming_deadline(self, programs: List[Dict]) -> List[Dict]:
        """마감 임박 사업 필터링"""
        today = datetime.now()
        upcoming_threshold = today + timedelta(days=7)  # 7일 이내

        filtered = []

        for program in programs:
            if program['deadline']:
                try:
                    deadline = datetime.strptime(program['deadline'], '%Y-%m-%d')
                    if today <= deadline <= upcoming_threshold:
                        filtered.append(program)
                except:
                    # 날짜 파싱 실패 시 제외
                    continue

        return filtered

    def _remove_duplicates(self, programs: List[Dict]) -> List[Dict]:
        """중복 제거"""
        seen_ids = set()
        unique_programs = []

        for program in programs:
            program_id = program['id']
            if program_id not in seen_ids:
                seen_ids.add(program_id)
                unique_programs.append(program)

        return unique_programs

    def _sort_programs(self, programs: List[Dict]) -> List[Dict]:
        """사업 정렬"""
        # 마감일 기준으로 정렬 (가까운 순)
        def get_deadline(program):
            if program['deadline']:
                try:
                    return datetime.strptime(program['deadline'], '%Y-%m-%d')
                except:
                    return datetime.max
            return datetime.max

        return sorted(programs, key=get_deadline)

    def get_program_detail(self, program_id: str) -> Optional[Dict]:
        """특정 지원사업 상세 정보 조회"""
        # ID에 따라 적절한 소스에서 상세 정보 조회
        if program_id.startswith('data_gov_'):
            return self._get_data_go_kr_detail(program_id)
        elif any(region in program_id for region in ['서울', '경기', '부산', '광주', '대구']):
            return self._get_region_detail(program_id)
        else:
            return None

    def _get_data_go_kr_detail(self, program_id: str) -> Optional[Dict]:
        """공공데이터포털 상세 정보 조회"""
        return None

    def _get_region_detail(self, program_id: str) -> Optional[Dict]:
        """지자체 상세 정보 조회"""
        return None

def search_startup_support(region: str = '전국', keyword: Optional[str] = None,
                         support_type: Optional[str] = None, deadline_only: bool = False) -> List[Dict]:
    """
    스타트업 지원사업 검색 함수

    Args:
        region: 지역 (서울특별시, 경기도, 부산광역시 등)
        keyword: 검색 키워드
        support_type: 지원 유형 (보조금, 융자, 멘토링 등)
        deadline_only: 마감 임박 사업만 검색

    Returns:
        지원사업 목록
    """
    api = StartupSupportAPI()
    return api.search_programs(region, keyword, support_type, deadline_only)

def get_startup_program_detail(program_id: str) -> Optional[Dict]:
    """
    특정 지원사업 상세 정보 조회 함수

    Args:
        program_id: 지원사업 ID

    Returns:
        지원사업 상세 정보
    """
    api = StartupSupportAPI()
    return api.get_program_detail(program_id)

if __name__ == "__main__":
    # 테스트용 실행
    print("스타트업 지원사업 검색 테스트")

    # 전체 검색
    programs = search_startup_support()
    print(f"총 {len(programs)}개 지원사업 발견")

    # 서울 검색
    seoul_programs = search_startup_support(region='서울특별시')
    print(f"서울 지원사업: {len(seoul_programs)}개")

    # 키워드 검색
    keyword_programs = search_startup_support(keyword='청년')
    print(f"'청년' 키워드 검색 결과: {len(keyword_programs)}개")

    # 마감 임박 검색
    deadline_programs = search_startup_support(deadline_only=True)
    print(f"마감 임박 지원사업: {len(deadline_programs)}개")
